export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const privacy: LegalDoc = {
  title: "Privacy Policy",
  intro:
    "Wconfa is a small, independent project made by students for WIUT students. We built it to collect as little about you as possible. This policy explains, in plain English, what we collect, why, and the choices you have.",
  sections: [
    {
      h: "What we collect",
      p: [
        "If you have an account: your WIUT email address, the username you choose, an optional display name, and the messages people send to you. The profile picture and bio stay empty unless you add them.",
        "If you send a message: the text of the message, the time it was sent, and sender details that we keep privately with it. If you are signed in to Wconfa when you send, that is your account. If you are not, it is a scrambled, one-way code made from your network (IP) address, never the address itself. The person you message never sees any of this. We do not store your name, device or location.",
        "Safety check: every message is sent, as text only, to an automated AI service that checks it for safety before it is delivered. Nothing about who sent it or who it is for goes with it. For messages that are held for review, we keep the AI's short reason in a private record that only moderators can see.",
        "For spam protection: when someone sends a message, we also store a separate scrambled code of their network (IP) address for 24 hours to enforce sending limits. This 24-hour code is kept apart from the message and is then deleted automatically.",
        "Search: when you search for someone, we keep a record that you searched (not what you typed) for 24 hours, only to stop people from copying the whole student list.",
        "Message status link: after you send a message, we show you a private link where you can check whether it is waiting for review, delivered or seen. We store only a scrambled, one-way version of that link, so we can't look it up or send it to you again. Anyone who has the link can see that status and the text of that message, so keep it to yourself. If you are signed in when you send, the message is also saved on your own Sent page, which only you can see, so you don't need the link. We keep that connection between your account and the message only so you can see its status and replies, and only for as long as the message is kept (90 days). The student you messaged is never told who you are.",
        "Profile: if you add a short bio, it is shown to everyone who visits your public profile. It goes through the same safety check as messages.",
        "Profile picture: if you add a photo, it is public. It is shown to everyone who visits your profile and to signed-in students who find you in search. Before it goes live, the picture (and nothing about you) is sent to an automated AI service that checks it for safety. Your phone or camera's hidden details, such as location, are removed before upload, and the photo is shrunk and stored under a random file name. We keep only your current photo: when you replace or remove it, or delete your account, the old file is deleted. Signed-in students can report a photo, and two reports take it down. We also keep a record that you uploaded (not the photo) for 24 hours to enforce an hourly upload limit.",
        "Replies: if the student you messaged replies, that reply is kept with your message and shows on your private status link, where you can answer back. Replies go through the same safety check. If a student chooses to post a message on their public profile, the text of the message and their answer are shown to everyone who visits that profile, without your name or any sender details, until the student removes them. Only you, through your status link or your Sent page, are told that the answer is to your message.",
        "Ask: if you post a question or an answer on Ask, its text is shown to signed-in WIUT students without your name or any account details (on your own question, your answers are labeled \"Asker\", nothing more). We keep privately which account wrote it, so you can see and delete your own posts and so moderators can act on posts that are waiting for review or reported. Every post goes through the same automated AI safety check, and for now a moderator also approves each post before it appears. We keep the text, the AI's short opinion and the moderator's decision in a private record, used only to check and improve the automatic checks. Your upvotes and reports are stored with your account but never shown to anyone. We also keep a record that you posted (not what) for 24 hours to enforce daily limits.",
        "If you use the contact form: the name, email and message you submit, so we can reply.",
        "Your password is stored only as a secure one-way hash by our authentication provider. Nobody, including us, can read it.",
      ],
    },
    {
      h: "Why we collect it",
      p: [
        "Your email and password let you sign in (or an emailed sign-in link) and confirm you are a WIUT student. Your username and display name create your personal link. Messages are stored so you can read them. The automated check and the short-lived spam code let us stop abuse and enforce sending limits. Sender details let moderators deal with reports and repeated abuse.",
      ],
    },
    {
      h: "How long we keep it",
      p: [
        "Messages are deleted automatically 90 days after they are sent. You can delete any message sooner. Sender details are deleted together with the message. A message that a moderator rejects after review is deleted immediately.",
        "Message status links stop working and are deleted 90 days after the message was sent.",
        "Replies are deleted together with the message they belong to. A message and answer that a student has posted on their profile stay there until that student removes them or deletes their account.",
        "Questions and answers on Ask, and the private review records about them, are deleted automatically 90 days after they are posted. You can delete your own question or answer sooner; deleting a question also deletes its answers.",
        "Spam-protection codes, including the scrambled code used to limit failed sign-in attempts, are deleted automatically after 24 hours.",
        "When you sign in, you stay signed in on that device for up to 30 days (your session refreshes automatically). After that, you'll be asked for your password again.",
        "Your account data is kept until you delete your account. Contact form messages are kept only as long as needed to handle your request.",
      ],
    },
    {
      h: "Your rights",
      p: [
        "You can download a copy of your data at any time from Settings → Download my data.",
        "You can change your username and display name, pause your inbox, hide yourself from search, or delete individual messages whenever you like.",
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
        "You can read only the approved messages sent to you, and we never show you who sent them.",
        "Signed-in WIUT students can find you in search by your display name or @username, and see whether your inbox is open. Nothing else from your account is shown. You can hide yourself from search in Settings → Show me in search; your link keeps working either way.",
        "If the person who sent you a message kept their status link (or sent it while signed in, in which case they see it on their own Sent page), they can see whether it was delivered and whether you have opened it, and they can read any reply you send them and answer back. They see nothing else about you or your inbox.",
        "Anyone who visits your profile can read the messages and answers you choose to post there. They are shown without any information about who sent the message.",
        "Questions and answers on Ask are shown only to signed-in WIUT students, never with who wrote them. Our moderators can see who wrote a question or answer that is waiting for review or has been reported. If three different students report a post, it is hidden until a moderator checks it.",
        "Our moderators can read messages that are held for review and messages that are reported. For those messages only, they can also see who the message was sent to and the sender details described above. They cannot browse other messages. During some periods we may review every message before it is delivered.",
        "A signed-in sender is identified by their account. For someone without an account, the sender detail is only a scrambled network code. It can be matched against a network address we already know, but it cannot be turned back into an address.",
        "We may disclose information we hold if we are legally required to.",
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
    "These terms are the rules for using Wconfa. By creating an account or sending a message, you agree to them. We've kept them short and readable.",
  sections: [
    {
      h: "Who can use Wconfa",
      p: [
        "Accounts are only for current students of Westminster International University in Tashkent (WIUT) with a valid student email address ending in @students.wiut.uz (the ID@wiut.uz chat address is not accepted). You must be at least 16 years old. Anyone may send a message to a student's link without an account, but senders must follow these terms too.",
        "Wconfa is an independent student project. It is not affiliated with, endorsed by, or operated by WIUT.",
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
        "Messages, replies, answers and posts on Ask are checked automatically. Some are blocked, and some are held for a human moderator to review before they are delivered. We also review reported messages and answers. Being anonymous to the person you message does not hide you from our moderators: they can see sender details for messages that are held or reported. We may remove any content and suspend or permanently close any account that breaks these terms or our Community Guidelines, with or without notice. You can stop using Wconfa and delete your account at any time.",
      ],
    },
    {
      h: "Liability",
      p: [
        "Wconfa is provided free of charge and \"as is\", without warranties of any kind. Messages are written by users, not by us, and we are not responsible for what others send. To the maximum extent allowed by law, the people who run Wconfa are not liable for any indirect or consequential loss arising from your use of the service. Nothing in these terms limits rights you have under applicable law that cannot be limited.",
      ],
    },
    {
      h: "Changes to these terms",
      p: [
        "We may update these terms as the project grows. We will change the date at the top and, for important changes, tell you in the app. Continuing to use Wconfa after changes means you accept the updated terms.",
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
    "Wconfa works when people use anonymity to be honest and kind, not cruel. These guidelines explain what's not okay, what to do if something goes wrong, and where to find support.",
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
      h: "Ask",
      p: [
        "Ask is for questions any WIUT student could help with: studies, campus life, events, buying and selling, advice. The same rules apply as for messages. Don't name or describe a real person so they can be recognised, and don't use it to start rumours.",
        "Every question and answer is checked before it appears, so it may take a little while to show up. Tap ··· on a post to report it. Posts reported by several students are hidden until a moderator looks at them.",
      ],
    },
    {
      h: "Why a message may not arrive",
      p: [
        "Every message is checked automatically before it is delivered. A message that is clearly harmful is blocked, and the sender sees a short note saying it can't be sent. A few messages are held until a moderator has looked at them, so some may arrive a little later, or not at all if they break the rules. If you saved the private link shown after sending, it tells you whether your message is waiting, delivered or seen.",
      ],
    },
    {
      h: "How to report",
      p: [
        "Open the message in your inbox and tap Report. The message is removed from your inbox straight away and sent to our moderators. Moderators can see who sent a reported message, and they can delete messages and suspend accounts that break the rules.",
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
