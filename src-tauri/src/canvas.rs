use std::sync::Mutex;

use regex::Regex;
use reqwest::{header, multipart, Client, Method, Response};
use serde::{de::DeserializeOwned, Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use url::Url;

const CREDENTIAL_SERVICE: &str = "au.edu.qut.examscanner.canvas";
const MANAGED_FILENAME_PREFIX: &str = "exam_scan_";
const MAX_PDF_BYTES: usize = 50 * 1024 * 1024;

type CommandResult<T> = Result<T, String>;

#[derive(Clone)]
struct CanvasSession {
    base_url: Url,
    access_token: String,
    client: Client,
}

#[derive(Default)]
pub struct CanvasState {
    session: Mutex<Option<CanvasSession>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasProfile {
    id: String,
    name: String,
    primary_email: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasCourse {
    id: String,
    name: String,
    course_code: String,
    term_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasAssignment {
    id: String,
    name: String,
    points_possible: Option<f64>,
    published: bool,
    rubric_title: Option<String>,
    rubric_points_possible: Option<f64>,
    use_rubric_for_grading: Option<bool>,
    rubric_criteria: Vec<CanvasRubricCriterion>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasRubricCriterion {
    id: String,
    description: Option<String>,
    long_description: Option<String>,
    points_possible: Option<f64>,
    criterion_use_range: bool,
    ignore_for_scoring: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasStudent {
    id: String,
    name: String,
    sortable_name: String,
    integration_id: Option<String>,
    sis_user_id: Option<String>,
    login_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasUploadRequest {
    course_id: String,
    assignment_id: String,
    user_id: String,
    score: Option<f64>,
    rubric_criterion_id: Option<String>,
    hash: String,
    pdf_bytes: Option<Vec<u8>>,
    include_comment: bool,
    comment: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasUploadResult {
    status: &'static str,
    attachment_filename: Option<String>,
}

#[derive(Deserialize)]
struct RawProfile {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    name: String,
    primary_email: Option<String>,
}

#[derive(Deserialize)]
struct RawTerm {
    name: Option<String>,
}

#[derive(Deserialize)]
struct RawCourse {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    name: String,
    course_code: String,
    term: Option<RawTerm>,
}

#[derive(Deserialize)]
struct RawAssignment {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    name: String,
    points_possible: Option<f64>,
    published: Option<bool>,
    rubric_settings: Option<RawRubricSettings>,
    use_rubric_for_grading: Option<bool>,
    #[serde(default)]
    rubric: Option<Vec<RawRubricCriterion>>,
}

#[derive(Deserialize)]
struct RawRubricSettings {
    title: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    points_possible: Option<f64>,
}

#[derive(Deserialize)]
struct RawRubricCriterion {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    description: Option<String>,
    long_description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    points: Option<f64>,
    criterion_use_range: Option<bool>,
    ignore_for_scoring: Option<bool>,
}

#[derive(Deserialize)]
struct RawStudent {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    name: String,
    sortable_name: Option<String>,
    integration_id: Option<String>,
    sis_user_id: Option<String>,
    login_id: Option<String>,
}

#[derive(Deserialize)]
struct RawAttachment {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    #[serde(alias = "display_name")]
    filename: Option<String>,
}

#[derive(Deserialize)]
struct RawComment {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
    comment: Option<String>,
    #[serde(default)]
    attachments: Vec<RawAttachment>,
}

#[derive(Deserialize)]
struct RawSubmission {
    score: Option<f64>,
    attempt: Option<u64>,
    #[serde(default)]
    rubric_assessment: Option<serde_json::Map<String, Value>>,
    #[serde(default)]
    submission_html_comments: Vec<RawComment>,
}

#[derive(Deserialize)]
struct UploadInstructions {
    upload_url: String,
    upload_params: serde_json::Map<String, Value>,
}

#[derive(Deserialize)]
struct UploadedFile {
    #[serde(deserialize_with = "deserialize_id")]
    id: String,
}

fn deserialize_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    match Value::deserialize(deserializer)? {
        Value::String(value) => Ok(value),
        Value::Number(value) => Ok(value.to_string()),
        _ => Err(serde::de::Error::custom("expected a Canvas object ID")),
    }
}

fn deserialize_optional_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    match Option::<Value>::deserialize(deserializer)? {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value
            .as_f64()
            .ok_or_else(|| serde::de::Error::custom("expected a finite number"))
            .and_then(|value| {
                value
                    .is_finite()
                    .then_some(Some(value))
                    .ok_or_else(|| serde::de::Error::custom("expected a finite number"))
            }),
        Some(Value::String(value)) if value.trim().is_empty() => Ok(None),
        Some(Value::String(value)) => value
            .trim()
            .parse::<f64>()
            .map_err(|_| serde::de::Error::custom("expected a number"))
            .and_then(|value| {
                value
                    .is_finite()
                    .then_some(Some(value))
                    .ok_or_else(|| serde::de::Error::custom("expected a finite number"))
            }),
        Some(_) => Err(serde::de::Error::custom("expected a number")),
    }
}

fn canvas_assignment_from_raw(assignment: RawAssignment) -> CanvasAssignment {
    let (rubric_title, rubric_points_possible) = assignment
        .rubric_settings
        .map(|settings| (settings.title, settings.points_possible))
        .unwrap_or((None, None));
    CanvasAssignment {
        id: assignment.id,
        name: assignment.name,
        points_possible: assignment.points_possible,
        published: assignment.published.unwrap_or(false),
        rubric_title,
        rubric_points_possible,
        use_rubric_for_grading: assignment.use_rubric_for_grading,
        rubric_criteria: assignment
            .rubric
            .unwrap_or_default()
            .into_iter()
            .map(|criterion| CanvasRubricCriterion {
                id: criterion.id,
                description: criterion.description,
                long_description: criterion.long_description,
                points_possible: criterion.points,
                criterion_use_range: criterion.criterion_use_range.unwrap_or(false),
                ignore_for_scoring: criterion.ignore_for_scoring.unwrap_or(false),
            })
            .collect(),
    }
}

fn validate_base_url(value: &str) -> CommandResult<Url> {
    let mut url =
        Url::parse(value.trim()).map_err(|_| "Enter a valid Canvas address.".to_owned())?;
    let local_debug_url = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if url.scheme() != "https" && !local_debug_url {
        return Err("The Canvas address must use HTTPS.".to_owned());
    }
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err("Enter the Canvas site address without credentials.".to_owned());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Enter only the Canvas site address, without a query or fragment.".to_owned());
    }
    url.set_path("/");
    Ok(url)
}

fn validate_canvas_id(value: &str, label: &str) -> CommandResult<()> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("Canvas returned an invalid {label}."));
    }
    Ok(())
}

fn credential_entry(base_url: &Url) -> CommandResult<keyring::Entry> {
    let host = base_url
        .host_str()
        .ok_or_else(|| "The Canvas address has no host.".to_owned())?;
    keyring::Entry::new(CREDENTIAL_SERVICE, host)
        .map_err(|error| format!("Could not open the operating system credential store: {error}"))
}

fn get_saved_token(base_url: &Url) -> CommandResult<Option<String>> {
    match credential_entry(base_url)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the saved Canvas token: {error}")),
    }
}

fn delete_saved_token(base_url: &Url) -> CommandResult<()> {
    match credential_entry(base_url)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the saved Canvas token: {error}")),
    }
}

fn current_session(state: &tauri::State<'_, CanvasState>) -> CommandResult<CanvasSession> {
    state
        .session
        .lock()
        .map_err(|_| "The Canvas session could not be accessed.".to_owned())?
        .clone()
        .ok_or_else(|| "Connect to Canvas first.".to_owned())
}

fn api_url(session: &CanvasSession, path: &str) -> CommandResult<Url> {
    session
        .base_url
        .join(path.trim_start_matches('/'))
        .map_err(|_| "Could not construct a Canvas API address.".to_owned())
}

fn same_origin(left: &Url, right: &Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn canvas_request(session: &CanvasSession, method: Method, url: Url) -> reqwest::RequestBuilder {
    session
        .client
        .request(method, url)
        .bearer_auth(&session.access_token)
        .header(header::ACCEPT, "application/json+canvas-string-ids")
}

async fn response_error(response: Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("errors")
                .and_then(Value::as_array)
                .and_then(|errors| errors.first())
                .and_then(|error| error.get("message").or(Some(error)))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| {
                    value
                        .get("message")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
        })
        .unwrap_or_else(|| body.chars().take(800).collect());
    if detail.trim().is_empty() {
        format!("Canvas returned {status}.")
    } else {
        format!("Canvas returned {status}: {}", detail.trim())
    }
}

async fn checked_json<T: DeserializeOwned>(response: Response) -> CommandResult<T> {
    if !response.status().is_success() {
        return Err(response_error(response).await);
    }
    response
        .json::<T>()
        .await
        .map_err(|error| format!("Canvas returned an unexpected response: {error}"))
}

fn next_link(headers: &header::HeaderMap) -> Option<String> {
    let links = headers.get(header::LINK)?.to_str().ok()?;
    links.split(',').find_map(|part| {
        let mut sections = part.trim().split(';');
        let url = sections
            .next()?
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>');
        let is_next = sections.any(|section| section.trim() == "rel=\"next\"");
        is_next.then(|| url.to_owned())
    })
}

async fn get_paginated<T: DeserializeOwned>(
    session: &CanvasSession,
    mut url: Url,
) -> CommandResult<Vec<T>> {
    let mut items = Vec::new();
    loop {
        if !same_origin(&session.base_url, &url) {
            return Err("Canvas returned an unsafe pagination address.".to_owned());
        }
        let response = canvas_request(session, Method::GET, url)
            .send()
            .await
            .map_err(|error| format!("Could not contact Canvas: {error}"))?;
        let next = next_link(response.headers());
        items.extend(checked_json::<Vec<T>>(response).await?);
        let Some(next) = next else { break };
        url = Url::parse(&next)
            .map_err(|_| "Canvas returned an invalid pagination address.".to_owned())?;
    }
    Ok(items)
}

fn normalise_comment(value: &str) -> String {
    let breaks = Regex::new(r"(?i)<br\s*/?>|</p>").expect("valid comment break regex");
    let tags = Regex::new(r"<[^>]+>").expect("valid comment tag regex");
    tags.replace_all(&breaks.replace_all(value, "\n"), "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .trim()
        .to_owned()
}

fn value_as_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(value) => value.as_f64().filter(|value| value.is_finite()),
        Value::String(value) => value
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite()),
        _ => None,
    }
}

fn rubric_assessment_update(
    existing: Option<&serde_json::Map<String, Value>>,
    criterion_id: &str,
    score: f64,
) -> Value {
    let mut assessment = serde_json::Map::new();
    if let Some(existing) = existing {
        for (existing_id, value) in existing {
            if existing_id == criterion_id {
                continue;
            }
            let Some(value) = value.as_object() else {
                continue;
            };
            let mut preserved = serde_json::Map::new();
            for field in ["rating_id", "points", "comments"] {
                if let Some(value) = value.get(field).filter(|value| !value.is_null()) {
                    preserved.insert(field.to_owned(), value.clone());
                }
            }
            if !preserved.is_empty() {
                assessment.insert(existing_id.clone(), Value::Object(preserved));
            }
        }
    }

    let mut selected = serde_json::Map::new();
    selected.insert("points".to_owned(), json!(score));
    if let Some(comments) = existing
        .and_then(|assessment| assessment.get(criterion_id))
        .and_then(Value::as_object)
        .and_then(|criterion| criterion.get("comments"))
        .filter(|value| !value.is_null())
    {
        selected.insert("comments".to_owned(), comments.clone());
    }
    assessment.insert(criterion_id.to_owned(), Value::Object(selected));
    Value::Object(assessment)
}

fn submission_score_matches(
    submission: &RawSubmission,
    score: Option<f64>,
    rubric_criterion_id: Option<&str>,
) -> bool {
    let Some(score) = score else {
        return true;
    };
    let current = if let Some(criterion_id) = rubric_criterion_id {
        submission
            .rubric_assessment
            .as_ref()
            .and_then(|assessment| assessment.get(criterion_id))
            .and_then(Value::as_object)
            .and_then(|criterion| criterion.get("points"))
            .and_then(value_as_f64)
    } else {
        submission.score
    };
    current.is_some_and(|current| (current - score).abs() < 0.000_001)
}

fn validate_rubric_target(score: Option<f64>, criterion_id: Option<&str>) -> CommandResult<()> {
    let Some(criterion_id) = criterion_id else {
        return Ok(());
    };
    if score.is_none() {
        return Err("A rubric criterion can only be selected when uploading a score.".to_owned());
    }
    if criterion_id.trim().is_empty()
        || criterion_id.len() > 256
        || criterion_id.chars().any(char::is_control)
    {
        return Err("Canvas returned an invalid rubric criterion ID.".to_owned());
    }
    Ok(())
}

fn submission_update_body(
    score: Option<f64>,
    rubric_criterion_id: Option<&str>,
    existing_rubric_assessment: Option<&serde_json::Map<String, Value>>,
    comment: Option<serde_json::Map<String, Value>>,
) -> Value {
    let mut body = serde_json::Map::new();
    if let Some(score) = score {
        if let Some(criterion_id) = rubric_criterion_id {
            body.insert(
                "rubric_assessment".to_owned(),
                rubric_assessment_update(existing_rubric_assessment, criterion_id, score),
            );
        } else {
            body.insert("submission".to_owned(), json!({ "posted_grade": score }));
        }
    }
    if let Some(comment) = comment {
        body.insert("comment".to_owned(), Value::Object(comment));
    }
    Value::Object(body)
}

async fn send_canvas_json<T: DeserializeOwned>(
    session: &CanvasSession,
    method: Method,
    url: Url,
    body: Option<Value>,
) -> CommandResult<T> {
    let mut request = canvas_request(session, method, url);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not contact Canvas: {error}"))?;
    checked_json(response).await
}

async fn send_canvas_without_body(
    session: &CanvasSession,
    method: Method,
    url: Url,
    body: Option<Value>,
) -> CommandResult<()> {
    let mut request = canvas_request(session, method, url);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not contact Canvas: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(response_error(response).await)
    }
}

async fn finish_file_upload(
    session: &CanvasSession,
    response: Response,
) -> CommandResult<UploadedFile> {
    let status = response.status();
    let location = response
        .headers()
        .get(header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    if status.is_success() {
        let body = response.bytes().await.unwrap_or_default();
        if !body.is_empty() {
            if let Ok(file) = serde_json::from_slice::<UploadedFile>(&body) {
                return Ok(file);
            }
        }
    } else if !status.is_redirection() {
        return Err(response_error(response).await);
    }

    let location = location.ok_or_else(|| {
        format!("The Canvas file service returned {status} without a completion address.")
    })?;
    let location = Url::parse(&location)
        .or_else(|_| session.base_url.join(&location))
        .map_err(|_| {
            "The Canvas file service returned an invalid completion address.".to_owned()
        })?;
    if !same_origin(&session.base_url, &location) {
        return Err("The Canvas file service returned an unsafe completion address.".to_owned());
    }
    let response = canvas_request(session, Method::GET, location)
        .send()
        .await
        .map_err(|error| format!("Could not complete the Canvas file upload: {error}"))?;
    checked_json(response).await
}

#[tauri::command]
pub fn canvas_has_saved_token(base_url: String) -> CommandResult<bool> {
    let base_url = validate_base_url(&base_url)?;
    Ok(get_saved_token(&base_url)?.is_some())
}

#[tauri::command]
pub async fn canvas_connect(
    state: tauri::State<'_, CanvasState>,
    base_url: String,
    access_token: Option<String>,
    remember_token: bool,
) -> CommandResult<CanvasProfile> {
    let base_url = validate_base_url(&base_url)?;
    let access_token = access_token
        .filter(|value| !value.trim().is_empty())
        .or(get_saved_token(&base_url)?)
        .ok_or_else(|| "Enter a Canvas access token.".to_owned())?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("Exam Scanner/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("Could not initialise secure web access: {error}"))?;
    let session = CanvasSession {
        base_url: base_url.clone(),
        access_token,
        client,
    };
    let profile_url = api_url(&session, "/api/v1/users/self/profile")?;
    let profile: RawProfile = send_canvas_json(&session, Method::GET, profile_url, None).await?;

    if remember_token {
        credential_entry(&base_url)?
            .set_password(&session.access_token)
            .map_err(|error| format!("Connected, but could not save the Canvas token: {error}"))?;
    } else {
        delete_saved_token(&base_url)?;
    }

    *state
        .session
        .lock()
        .map_err(|_| "The Canvas session could not be updated.".to_owned())? = Some(session);

    Ok(CanvasProfile {
        id: profile.id,
        name: profile.name,
        primary_email: profile.primary_email,
    })
}

#[tauri::command]
pub fn canvas_disconnect(
    state: tauri::State<'_, CanvasState>,
    forget_token: bool,
) -> CommandResult<()> {
    let previous = state
        .session
        .lock()
        .map_err(|_| "The Canvas session could not be updated.".to_owned())?
        .take();
    if forget_token {
        if let Some(session) = previous {
            delete_saved_token(&session.base_url)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn canvas_list_courses(
    state: tauri::State<'_, CanvasState>,
) -> CommandResult<Vec<CanvasCourse>> {
    let session = current_session(&state)?;
    let mut url = api_url(&session, "/api/v1/courses")?;
    url.query_pairs_mut()
        .append_pair("enrollment_state", "active")
        .append_pair("include[]", "term")
        .append_pair("per_page", "100");
    let courses: Vec<RawCourse> = get_paginated(&session, url).await?;
    Ok(courses
        .into_iter()
        .map(|course| CanvasCourse {
            id: course.id,
            name: course.name,
            course_code: course.course_code,
            term_name: course.term.and_then(|term| term.name),
        })
        .collect())
}

#[tauri::command]
pub async fn canvas_list_assignments(
    state: tauri::State<'_, CanvasState>,
    course_id: String,
) -> CommandResult<Vec<CanvasAssignment>> {
    validate_canvas_id(&course_id, "course ID")?;
    let session = current_session(&state)?;
    let mut url = api_url(
        &session,
        &format!("/api/v1/courses/{course_id}/assignments"),
    )?;
    url.query_pairs_mut()
        .append_pair("order_by", "position")
        .append_pair("per_page", "100");
    let assignments: Vec<RawAssignment> = get_paginated(&session, url).await?;
    Ok(assignments
        .into_iter()
        .map(canvas_assignment_from_raw)
        .collect())
}

#[tauri::command]
pub async fn canvas_list_students(
    state: tauri::State<'_, CanvasState>,
    course_id: String,
) -> CommandResult<Vec<CanvasStudent>> {
    validate_canvas_id(&course_id, "course ID")?;
    let session = current_session(&state)?;
    let mut url = api_url(&session, &format!("/api/v1/courses/{course_id}/users"))?;
    url.query_pairs_mut()
        .append_pair("enrollment_type[]", "student")
        .append_pair("enrollment_state[]", "active")
        .append_pair("per_page", "100");
    let students: Vec<RawStudent> = get_paginated(&session, url).await?;
    Ok(students
        .into_iter()
        .map(|student| CanvasStudent {
            id: student.id,
            sortable_name: student
                .sortable_name
                .unwrap_or_else(|| student.name.clone()),
            name: student.name,
            integration_id: student.integration_id,
            sis_user_id: student.sis_user_id,
            login_id: student.login_id,
        })
        .collect())
}

#[tauri::command]
pub async fn canvas_upload_result(
    state: tauri::State<'_, CanvasState>,
    request: CanvasUploadRequest,
) -> CommandResult<CanvasUploadResult> {
    validate_canvas_id(&request.course_id, "course ID")?;
    validate_canvas_id(&request.assignment_id, "assignment ID")?;
    validate_canvas_id(&request.user_id, "user ID")?;
    if request.score.is_none() && request.pdf_bytes.is_none() {
        return Err("Choose a grade, an annotated PDF, or both.".to_owned());
    }
    if request.score.is_some_and(|score| !score.is_finite()) {
        return Err("The grade is not a finite number.".to_owned());
    }
    let rubric_criterion_id = request.rubric_criterion_id.clone();
    validate_rubric_target(request.score, rubric_criterion_id.as_deref())?;
    if let Some(pdf) = &request.pdf_bytes {
        if request.hash.len() != 8 || !request.hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("The generated PDF hash is invalid.".to_owned());
        }
        if pdf.len() > MAX_PDF_BYTES {
            return Err("The annotated PDF is larger than 50 MB.".to_owned());
        }
        if !pdf.starts_with(b"%PDF") {
            return Err("The annotated attachment is not a PDF.".to_owned());
        }
    }

    let session = current_session(&state)?;
    let submission_path = format!(
        "/api/v1/courses/{}/assignments/{}/submissions/{}",
        request.course_id, request.assignment_id, request.user_id
    );
    let update_url = api_url(&session, &submission_path)?;
    if request.pdf_bytes.is_none() && rubric_criterion_id.is_none() {
        send_canvas_without_body(
            &session,
            Method::PUT,
            update_url,
            Some(submission_update_body(request.score, None, None, None)),
        )
        .await?;
        return Ok(CanvasUploadResult {
            status: "updated",
            attachment_filename: None,
        });
    }

    let mut submission_url = api_url(&session, &submission_path)?;
    if request.pdf_bytes.is_some() {
        submission_url
            .query_pairs_mut()
            .append_pair("include[]", "submission_html_comments");
    }
    if rubric_criterion_id.is_some() {
        submission_url
            .query_pairs_mut()
            .append_pair("include[]", "rubric_assessment");
    }
    let submission: RawSubmission =
        send_canvas_json(&session, Method::GET, submission_url, None).await?;

    if request.pdf_bytes.is_none() {
        if submission_score_matches(&submission, request.score, rubric_criterion_id.as_deref()) {
            return Ok(CanvasUploadResult {
                status: "unchanged",
                attachment_filename: None,
            });
        }
        send_canvas_without_body(
            &session,
            Method::PUT,
            update_url,
            Some(submission_update_body(
                request.score,
                rubric_criterion_id.as_deref(),
                submission.rubric_assessment.as_ref(),
                None,
            )),
        )
        .await?;
        return Ok(CanvasUploadResult {
            status: "updated",
            attachment_filename: None,
        });
    }

    let filename = format!("{MANAGED_FILENAME_PREFIX}{}.pdf", request.hash);
    let expected_comment = if request.include_comment {
        &request.comment
    } else {
        ""
    };
    let score_matches =
        submission_score_matches(&submission, request.score, rubric_criterion_id.as_deref());
    let mut can_reuse_attachment = false;
    let mut removed_stale_attachment = false;

    for comment in submission
        .submission_html_comments
        .iter()
        .filter(|comment| {
            comment.attachments.iter().any(|attachment| {
                attachment
                    .filename
                    .as_deref()
                    .is_some_and(|name| name.starts_with(MANAGED_FILENAME_PREFIX))
            })
        })
    {
        let existing_filename = comment.attachments.iter().find_map(|item| {
            item.filename
                .as_deref()
                .filter(|name| name.starts_with(MANAGED_FILENAME_PREFIX))
        });
        let reusable = existing_filename == Some(filename.as_str())
            && normalise_comment(comment.comment.as_deref().unwrap_or_default())
                == normalise_comment(expected_comment);
        if reusable {
            can_reuse_attachment = true;
            continue;
        }

        for attachment in &comment.attachments {
            let url = api_url(&session, &format!("/api/v1/files/{}", attachment.id))?;
            send_canvas_without_body(&session, Method::DELETE, url, None).await?;
        }
        let url = api_url(
            &session,
            &format!("{submission_path}/comments/{}", comment.id),
        )?;
        send_canvas_without_body(&session, Method::DELETE, url, None).await?;
        removed_stale_attachment = true;
    }

    if can_reuse_attachment {
        if !score_matches {
            send_canvas_without_body(
                &session,
                Method::PUT,
                update_url,
                Some(submission_update_body(
                    request.score,
                    rubric_criterion_id.as_deref(),
                    submission.rubric_assessment.as_ref(),
                    None,
                )),
            )
            .await?;
        }
        return Ok(CanvasUploadResult {
            status: if score_matches && !removed_stale_attachment {
                "unchanged"
            } else {
                "updated"
            },
            attachment_filename: Some(filename),
        });
    }

    let pdf_bytes = request
        .pdf_bytes
        .expect("PDF presence was validated before reading the submission");

    let upload_url = api_url(&session, &format!("{submission_path}/comments/files"))?;
    let instructions: UploadInstructions = send_canvas_json(
        &session,
        Method::POST,
        upload_url,
        Some(json!({
            "name": filename,
            "size": pdf_bytes.len(),
            "content_type": "application/pdf"
        })),
    )
    .await?;

    let external_url = Url::parse(&instructions.upload_url)
        .map_err(|_| "Canvas returned an invalid file upload address.".to_owned())?;
    if external_url.scheme() != "https" {
        return Err("Canvas returned a file upload address that does not use HTTPS.".to_owned());
    }
    let mut form = multipart::Form::new();
    for (key, value) in instructions.upload_params {
        let value = match value {
            Value::String(value) => value,
            other => other.to_string(),
        };
        form = form.text(key, value);
    }
    form = form.part(
        "file",
        multipart::Part::bytes(pdf_bytes)
            .file_name(filename.clone())
            .mime_str("application/pdf")
            .map_err(|error| format!("Could not prepare the annotated PDF: {error}"))?,
    );
    let response = session
        .client
        .post(external_url)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("Could not upload the annotated PDF: {error}"))?;
    let uploaded_file = finish_file_upload(&session, response).await?;

    let mut comment = serde_json::Map::new();
    comment.insert("file_ids".to_owned(), json!([uploaded_file.id]));
    if let Some(attempt) = submission.attempt {
        comment.insert("attempt".to_owned(), json!(attempt));
    }
    if request.include_comment {
        comment.insert("text_comment".to_owned(), Value::String(request.comment));
    }
    send_canvas_without_body(
        &session,
        Method::PUT,
        update_url,
        Some(submission_update_body(
            request.score,
            rubric_criterion_id.as_deref(),
            submission.rubric_assessment.as_ref(),
            Some(comment),
        )),
    )
    .await?;

    Ok(CanvasUploadResult {
        status: "updated",
        attachment_filename: Some(filename),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        canvas_assignment_from_raw, next_link, normalise_comment, submission_score_matches,
        submission_update_body, validate_base_url, validate_rubric_target, RawAssignment,
        RawSubmission,
    };
    use reqwest::header::{HeaderMap, HeaderValue, LINK};
    use serde_json::{json, Map, Value};

    #[test]
    fn canvas_address_is_normalised_to_the_site_root() {
        let url = validate_base_url("https://canvas.example.edu/some/path/").unwrap();
        assert_eq!(url.as_str(), "https://canvas.example.edu/");
    }

    #[test]
    fn canvas_address_rejects_insecure_remote_sites() {
        assert!(validate_base_url("http://canvas.example.edu").is_err());
    }

    #[test]
    fn pagination_selects_the_next_link() {
        let mut headers = HeaderMap::new();
        headers.insert(
            LINK,
            HeaderValue::from_static(
                "<https://canvas.example.edu/api/v1/courses?page=1>; rel=\"current\", <https://canvas.example.edu/api/v1/courses?page=2>; rel=\"next\"",
            ),
        );
        assert_eq!(
            next_link(&headers).as_deref(),
            Some("https://canvas.example.edu/api/v1/courses?page=2")
        );
    }

    #[test]
    fn canvas_html_comments_compare_as_plain_text() {
        assert_eq!(
            normalise_comment("<p>Marked sheet attached.<br>Contact us &amp; report errors.</p>"),
            "Marked sheet attached.\nContact us & report errors."
        );
    }

    #[test]
    fn assignment_rubric_metadata_maps_for_the_desktop_ui() {
        let raw: RawAssignment = serde_json::from_value(json!({
            "id": 42,
            "name": "Final exam",
            "points_possible": 60,
            "published": true,
            "use_rubric_for_grading": true,
            "rubric_settings": {
                "title": "Exam sections",
                "points_possible": "60"
            },
            "rubric": [{
                "id": "_mcq",
                "description": "Multiple choice",
                "long_description": "Automatically marked section",
                "points": "40",
                "criterion_use_range": true,
                "ignore_for_scoring": false
            }, {
                "id": 22,
                "description": "Written response",
                "points": 20,
                "criterion_use_range": true,
                "ignore_for_scoring": true
            }]
        }))
        .unwrap();

        let assignment = canvas_assignment_from_raw(raw);
        assert_eq!(assignment.id, "42");
        assert_eq!(assignment.rubric_title.as_deref(), Some("Exam sections"));
        assert_eq!(assignment.rubric_points_possible, Some(60.0));
        assert_eq!(assignment.use_rubric_for_grading, Some(true));
        assert_eq!(assignment.rubric_criteria.len(), 2);
        assert_eq!(assignment.rubric_criteria[0].id, "_mcq");
        assert_eq!(assignment.rubric_criteria[0].points_possible, Some(40.0));
        assert!(assignment.rubric_criteria[0].criterion_use_range);
        assert_eq!(assignment.rubric_criteria[1].id, "22");
        assert!(assignment.rubric_criteria[1].ignore_for_scoring);
    }

    #[test]
    fn assignment_without_a_rubric_maps_to_empty_metadata() {
        let raw: RawAssignment = serde_json::from_value(json!({
            "id": "42",
            "name": "Final exam",
            "points_possible": null,
            "rubric": null
        }))
        .unwrap();

        let assignment = canvas_assignment_from_raw(raw);
        assert!(assignment.rubric_title.is_none());
        assert!(assignment.rubric_points_possible.is_none());
        assert!(assignment.use_rubric_for_grading.is_none());
        assert!(assignment.rubric_criteria.is_empty());
    }

    #[test]
    fn grade_only_update_body_contains_no_comment() {
        assert_eq!(
            submission_update_body(Some(9.0), None, None, None),
            json!({ "submission": { "posted_grade": 9.0 } })
        );
    }

    #[test]
    fn pdf_only_update_body_contains_no_grade() {
        let mut comment = Map::new();
        comment.insert("file_ids".to_owned(), json!([42]));

        assert_eq!(
            submission_update_body(None, None, None, Some(comment)),
            json!({ "comment": { "file_ids": [42] } })
        );
    }

    #[test]
    fn combined_update_body_contains_grade_and_comment() {
        let mut comment = Map::new();
        comment.insert(
            "text_comment".to_owned(),
            Value::String("Marked sheet attached.".to_owned()),
        );

        assert_eq!(
            submission_update_body(Some(9.0), None, None, Some(comment)),
            json!({
                "submission": { "posted_grade": 9.0 },
                "comment": { "text_comment": "Marked sheet attached." }
            })
        );
    }

    #[test]
    fn rubric_update_preserves_other_criteria_and_selected_comments() {
        let existing = json!({
            "_mcq": {
                "rating_id": "old-rating",
                "points": 5,
                "comments": "Check question 4"
            },
            "_written": {
                "rating_id": "full-marks",
                "points": 20,
                "comments": "Well argued",
                "description": "Read-only response field"
            }
        });
        let existing = existing.as_object().unwrap();

        assert_eq!(
            submission_update_body(Some(9.0), Some("_mcq"), Some(existing), None),
            json!({
                "rubric_assessment": {
                    "_mcq": {
                        "points": 9.0,
                        "comments": "Check question 4"
                    },
                    "_written": {
                        "rating_id": "full-marks",
                        "points": 20,
                        "comments": "Well argued"
                    }
                }
            })
        );
    }

    #[test]
    fn submission_scores_are_compared_against_the_selected_destination() {
        let submission: RawSubmission = serde_json::from_value(json!({
            "score": 35,
            "rubric_assessment": {
                "_mcq": { "points": "15" }
            }
        }))
        .unwrap();

        assert!(submission_score_matches(&submission, Some(35.0), None));
        assert!(submission_score_matches(
            &submission,
            Some(15.0),
            Some("_mcq")
        ));
        assert!(!submission_score_matches(
            &submission,
            Some(16.0),
            Some("_mcq")
        ));
        assert!(!submission_score_matches(
            &submission,
            Some(15.0),
            Some("_missing")
        ));
        assert!(submission_score_matches(
            &submission,
            None,
            Some("_missing")
        ));
    }

    #[test]
    fn rubric_target_requires_a_score_and_nonblank_id() {
        assert!(validate_rubric_target(Some(9.0), Some("_mcq")).is_ok());
        assert!(validate_rubric_target(None, None).is_ok());
        assert!(validate_rubric_target(None, Some("_mcq")).is_err());
        assert!(validate_rubric_target(Some(9.0), Some("   ")).is_err());
    }
}
