export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const privacy: LegalDoc = {
  title: "Privacy Policy",
  intro:
    "west confa is a small, independent project made by students for WIUT students. We built it to collect as little about you as possible. This policy explains, in plain English, what we collect, why, and the choices you have.",
  sections: [
    {
      h: "What we collect",
      p: [
        "If you have an account: your WIUT email address, the username you choose, an optional display name, and the messages people send to you. The account fields for profile picture and bio exist for a future update but stay empty unless you fill them in.",
        "If you send a message: only the text of the message and the time it was sent. We never store your name, account, email, device, or location with a message.",
        "For spam protection only: when someone sends a message, we store a salted, one-way hash of their network (IP) address. It cannot be turned back into the address, is never linked to the message itself, and is automatically deleted after 24 hours.",
        "If you use the contact form: the name, email and message you submit, so we can reply.",
        "Your password is stored only as a secure one-way hash by our authentication provider. Nobody, including us, can read it.",
      ],
    },
    {
      h: "Why we collect it",
      p: [
        "Your email and password let you sign in (or an emailed sign-in link) and confirm you are a WIUT student. Your username and display name create your personal link. Messages are stored so you can read them. The short-lived hash lets us enforce sending limits and stop spam and abuse.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "Messages are deleted automatically 90 days after they are sent. You can delete any message sooner.",
        "Spam-protection hashes, including the scrambled code used to limit failed sign-in attempts, are deleted automatically after 24 hours.",
        "When you sign in, you stay signed in on that device for up to 30 days (your session refreshes automatically). After that, you'll be asked for your password again.",
        "Your account data is kept until you delete your account. Contact form messages are kept only as long as needed to handle your request.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "You can download a copy of your data at any time from Settings → Download my data.",
        "You can change your username and display name, pause your inbox, or delete individual messages whenever you like.",
        "You can permanently delete your account from Settings → Delete account. This immediately deletes your profile and every message sent to you. It cannot be undone.",
        "You can ask us any question about your data using the contact form.",
      ],
    },
    {
      h: "What we never do",
      p: [
        "We do not sell, rent, or share your data with anyone for marketing. We do not show ads. We do not use analytics, advertising pixels, or third-party trackers. We only use essential cookies and local storage to keep you signed in (for up to 30 days) and remember your theme preference.",
      ],
    },
    {
      h: "Who can see what",
      p: [
        "Only you can read the messages sent to you. If you report a message, our moderators can see that message so they can review it. Moderators cannot see who sent any message, because we do not have that information.",
        "We may disclose information if we are legally required to, but because we do not store sender identity, we cannot reveal who sent a message.",
      ],
    },
    {
      h: "Security",
      p: [
        "Data is stored with a reputable cloud provider, encrypted in transit, and protected by strict access rules so each user can only reach their own data. No system is perfectly secure, but we work to keep your data safe and to collect as little as possible in the first place.",
      ],
    },
    {
      h: "Changes and contact",
      p: [
        "If we change this policy we will update the date at the top and, for significant changes, let you know in the app. Questions? Reach us through the Contact page.",
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms of Service",
  intro:
    "These terms are the rules for using west confa. By creating an account or sending a message, you agree to them. We've kept them short and readable.",
  sections: [
    {
      h: "Who can use west confa",
      p: [
        "Accounts are only for current students of Westminster International University in Tashkent (WIUT) with a valid student email address ending in @students.wiut.uz (the ID@wiut.uz chat address is not accepted). You must be at least 16 years old. Anyone may send a message to a student's link without an account, but senders must follow these terms too.",
        "west confa is an independent student project. It is not affiliated with, endorsed by, or operated by WIUT.",
      ],
    },
    {
      h: "Your account",
      p: [
        "Keep access to your email secure, because it is how you sign in. Choose a username that is not offensive, does not impersonate someone else, and does not include anyone's personal details. You are responsible for how you share your link.",
      ],
    },
    {
      h: "Prohibited content",
      p: [
        "You may not send or post content that: threatens, intimidates, or encourages violence or self-harm; contains hate speech or slurs about race, ethnicity, nationality, religion, gender, sexual orientation, disability, or any other identity; is sexually explicit or sexually harasses someone; shares anyone's personal information (phone numbers, addresses, social handles, private photos); spreads false rumours meant to damage someone's reputation; is spam, scams, or advertising; or breaks the law.",
      ],
    },
    {
      h: "Harassment and bullying",
      p: [
        "Anonymity is not a licence to hurt people. Repeated negative messages, targeting someone for who they are, ganging up on someone, or trying to work out who sent a message in order to retaliate are all forbidden. We take bullying seriously and will act on reports.",
      ],
    },
    {
      h: "Moderation, suspension and termination",
      p: [
        "We filter some content automatically and review reported messages. We may remove any content and suspend or permanently close any account that breaks these terms or our Community Guidelines, with or without notice. You can stop using west confa and delete your account at any time.",
      ],
    },
    {
      h: "Liability",
      p: [
        "west confa is provided free of charge and \"as is\", without warranties of any kind. Messages are written by users, not by us, and we are not responsible for what others send. To the maximum extent allowed by law, the people who run west confa are not liable for any indirect or consequential loss arising from your use of the service. Nothing in these terms limits rights you have under applicable law that cannot be limited.",
      ],
    },
    {
      h: "Changes to these terms",
      p: [
        "We may update these terms as the project grows. We will change the date at the top and, for important changes, tell you in the app. Continuing to use west confa after changes means you accept the updated terms.",
      ],
    },
    {
      h: "Contact",
      p: ["Questions about these terms? Use the Contact page."],
    },
  ],
};

export const guidelines: LegalDoc = {
  title: "Community Guidelines & Help",
  intro:
    "west confa works when people use anonymity to be honest and kind, not cruel. These guidelines explain what's not okay, what to do if something goes wrong, and where to find support.",
  sections: [
    {
      h: "The short version",
      p: ["Send messages you'd be comfortable receiving. Compliments, honest feedback, encouragement and fun questions are welcome. Cruelty is not."],
    },
    {
      h: "What's not allowed",
      p: [
        "Threats or encouraging anyone to hurt themselves or others.",
        "Slurs, hate speech, or attacks on someone's identity, appearance, or background.",
        "Sexual comments, unwanted advances, or explicit content.",
        "Sharing personal details such as phone numbers, addresses, social media handles or photos.",
        "Rumours, lies, or 'exposing' someone.",
        "Spam, scams, advertising, or flooding someone's inbox.",
      ],
    },
    {
      h: "How to report",
      p: [
        "Open the message in your inbox and tap Report. The message is removed from your inbox straight away and sent to our moderators. Moderators can delete messages and suspend accounts that break the rules.",
        "If you'd rather not receive anything for a while, go to Settings and turn off 'Accept new messages'. You can turn it back on whenever you're ready.",
        "For anything else, including a safety concern about an account, use the Contact page.",
      ],
    },
    {
      h: "If a message upsets you",
      p: [
        "It's okay to feel hurt. Remember that an anonymous message says more about the sender than about you. You don't have to reply, screenshot, or try to guess who sent it. Delete or report it and talk to someone you trust.",
      ],
    },
    {
      h: "Support contacts",
      p: [
        "WIUT Student Support / Counselling: [contact details to be added]",
        "WIUT Student Welfare Office: [contact details to be added]",
        "Mental health helpline (Uzbekistan): [contact details to be added]",
        "In an emergency, call 112 (Uzbekistan) or your local emergency number immediately.",
      ],
    },
  ],
};
