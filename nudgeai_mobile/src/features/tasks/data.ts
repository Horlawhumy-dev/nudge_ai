import { addDays, dateKey } from '@/lib/date';

import type { Task } from './types';

/** Seeds mirror the design list: one overdue, two done, two coming up. */
export function buildSeedTasks(now: Date = new Date()): Task[] {
  const today = dateKey(now);
  return [
    {
      id: 'task_case_study',
      title: 'Finish case study presentation...',
      date: dateKey(addDays(now, -1)),
      startTime: '12:30',
      endTime: '13:30',
      priority: 'Low',
      done: false,
    },
    {
      id: 'task_client_reply',
      title: 'Reply to the client message...',
      date: today,
      startTime: '09:00',
      endTime: '10:45',
      priority: 'High',
      done: true,
    },
    {
      id: 'task_standup',
      title: 'Team standup meeting on Google Meet',
      date: today,
      startTime: '11:00',
      endTime: '12:15',
      priority: 'High',
      done: true,
    },
    {
      id: 'task_review',
      title: 'Review Nudge design & feedback',
      date: today,
      startTime: '14:00',
      endTime: '15:00',
      priority: 'Medium',
      done: false,
    },
    {
      id: 'task_call',
      title: 'Call with designer Bukola & dev team',
      date: today,
      startTime: '18:30',
      endTime: '20:00',
      priority: 'Medium',
      done: false,
    },
  ];
}
