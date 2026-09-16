mod canvas;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(canvas::CanvasState::default())
        .invoke_handler(tauri::generate_handler![
            canvas::canvas_has_saved_token,
            canvas::canvas_connect,
            canvas::canvas_disconnect,
            canvas::canvas_list_courses,
            canvas::canvas_list_assignments,
            canvas::canvas_list_students,
            canvas::canvas_upload_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Exam Scanner");
}
