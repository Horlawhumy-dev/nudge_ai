export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; sections: LegalSection[] };

/** Draft wording for the static build. Have it reviewed before a public release. */
export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: 'October 2026',
  sections: [
    {
      heading: 'Using Nudge',
      body: [
        'Nudge helps you plan habits and tasks and sends reminders. By creating an account or using the app you agree to these terms.',
        'You must be old enough to form a binding agreement where you live, and you are responsible for the activity on your account.',
      ],
    },
    {
      heading: 'Your content',
      body: [
        'Habits, tasks and messages you create belong to you. You give Nudge permission to store and process them to run the features you use.',
      ],
    },
    {
      heading: 'AI features',
      body: [
        'Nudge AI can suggest, summarise and reschedule. Suggestions may be wrong, so check anything important before you rely on it.',
        'Nudge is a productivity tool. It does not provide medical, nutrition or mental-health advice.',
      ],
    },
    {
      heading: 'Plans and billing',
      body: [
        'The Free plan has limits on habits and tasks. Paid plans, when available, renew until cancelled and can be managed from your app store account.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'Don’t misuse the service, attempt to break it, or use it to harm others. We may suspend accounts that do.',
      ],
    },
    {
      heading: 'Changes and contact',
      body: [
        'We may update these terms and will tell you about material changes. Questions? Use Send feedback in Settings.',
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'October 2026',
  sections: [
    {
      heading: 'What we collect',
      body: [
        'Account details (name, email), the habits and tasks you create, your reminder preferences, and conversations with Nudge AI.',
        'In this version of the app, this information is stored on your device.',
      ],
    },
    {
      heading: 'How we use it',
      body: [
        'To show your data back to you, schedule reminders at the times you chose, and personalise Nudge AI’s replies and weekly reports.',
        'We don’t sell your personal information.',
      ],
    },
    {
      heading: 'AI processing',
      body: [
        'When you message Nudge AI, the content of that conversation may be sent to our AI model providers to produce a reply. Avoid sharing sensitive information in chats.',
      ],
    },
    {
      heading: 'Notifications and permissions',
      body: [
        'Reminders use notification permission, which you can change in your device settings at any time. Choosing a profile photo uses your photo library only when you pick one.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can edit your profile, clear chat history, change reminder settings, or delete your account from Settings. Deleting your account removes your data from the app.',
      ],
    },
  ],
};
