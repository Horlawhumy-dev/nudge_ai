import type { Task } from './types';

export const seedTasks: Task[] = [
  {
    id: 'task_case_study',
    title: 'Finish case study presentation...',
    startTime: '12:30 pm',
    endTime: '1:30 pm',
    priority: 'Low',
    done: false,
    overdue: true,
  },
  {
    id: 'task_client_reply',
    title: 'Reply to the client message...',
    startTime: '9:00 am',
    endTime: '10:45 am',
    priority: 'High',
    done: true,
    overdue: false,
  },
  {
    id: 'task_standup',
    title: 'Team standup meeting on Google..',
    startTime: '11:00 am',
    endTime: '12:15 pm',
    priority: 'High',
    done: true,
    overdue: false,
  },
  {
    id: 'task_review',
    title: 'Review Nudge design &...',
    startTime: '2:00 pm',
    endTime: '3:00 pm',
    priority: 'Medium',
    done: false,
    overdue: false,
  },
  {
    id: 'task_call',
    title: 'Call with designer Bukola & dev...',
    startTime: '6:30 pm',
    endTime: '8:00 pm',
    priority: 'Medium',
    done: false,
    overdue: false,
  },
];
