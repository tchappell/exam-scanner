import { invoke, isTauri } from '@tauri-apps/api/core';

export const isDesktopApp = () => isTauri();

function canvasInvoke(command, args = {}) {
  return invoke(command, args).catch(error => {
    throw new Error(typeof error === 'string' ? error : (error?.message ?? 'Canvas request failed.'));
  });
}

export const hasSavedCanvasToken = baseUrl => canvasInvoke('canvas_has_saved_token', { baseUrl });

export const connectCanvas = ({ baseUrl, accessToken, rememberToken }) => canvasInvoke('canvas_connect', {
  baseUrl,
  accessToken: accessToken || null,
  rememberToken
});

export const disconnectCanvas = forgetToken => canvasInvoke('canvas_disconnect', { forgetToken });

export const listCanvasCourses = () => canvasInvoke('canvas_list_courses');

export const listCanvasAssignments = courseId => canvasInvoke('canvas_list_assignments', { courseId });

export const listCanvasStudents = courseId => canvasInvoke('canvas_list_students', { courseId });

export const uploadCanvasResult = request => canvasInvoke('canvas_upload_result', { request });

export function canvasStudentsToGradebookRows(students) {
  const headings = [
    ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Integration ID', 'Section'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', '']
  ];
  const rows = students.map(student => [
    student.sortableName || student.name,
    student.id,
    student.sisUserId || '',
    student.loginId || '',
    student.integrationId || student.sisUserId || student.loginId || '',
    ''
  ]);
  return [...headings, ...rows];
}
