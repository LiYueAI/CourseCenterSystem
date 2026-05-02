export interface User {
  id: string;
  name: string;
  email: string;
  role: 'teacher' | 'student' | 'admin';
  school_id?: number;
}

export interface ClassroomSession {
  id: number;
  teacher_id: number;
  customization_id: number;
  status: 'idle' | 'playing' | 'paused' | 'completed';
  current_module_index: number;
  current_item_index: number;
  started_at: string;
  ended_at?: string;
}
