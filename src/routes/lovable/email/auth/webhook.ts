import * as React from 'react'
import { createAuthEmailHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

import { emailCopy } from "@/i18n/email.en"

// Configuration
const SITE_NAME = emailCopy.brand
const SENDER_DOMAIN = "notify.westconfa.tech"
const ROOT_DOMAIN = "westconfa.tech"
const FROM_DOMAIN = "westconfa.tech"
const SITE_URL = "https://westconfa.tech"

// The SDK handler owns verification, dispatch, and retry semantics; this file
// owns only the email decisions: subjects, templates, and per-type props.
export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const handler = createAuthEmailHandler({
          apiKey: process.env['LOVABLE_API_KEY']!,
          from: { name: SITE_NAME, address: `noreply@${FROM_DOMAIN}` },
          senderDomain: SENDER_DOMAIN,
          sendUrl: process.env['LOVABLE_SEND_URL'],
          emails: {
            signup: {
              subject: emailCopy.signup.subject,
              render: (data) =>
                React.createElement(SignupEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  recipient: data.email,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                }),
            },
            invite: {
              subject: emailCopy.invite.subject,
              render: (data) =>
                React.createElement(InviteEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                }),
            },
            magiclink: {
              subject: emailCopy.magiclink.subject,
              render: (data) =>
                React.createElement(MagicLinkEmail, {
                  siteName: SITE_NAME,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                }),
            },
            recovery: {
              subject: emailCopy.recovery.subject,
              render: (data) =>
                React.createElement(RecoveryEmail, {
                  siteName: SITE_NAME,
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                }),
            },
            email_change: {
              subject: emailCopy.email_change.subject,
              render: (data) =>
                React.createElement(EmailChangeEmail, {
                  siteName: SITE_NAME,
                  oldEmail: data.old_email ?? '',
                  email: data.email,
                  newEmail: data.new_email ?? '',
                  confirmationUrl: data.url,
                  token: data.token ?? "",
                }),
            },
            reauthentication: {
              subject: emailCopy.reauthentication.subject,
              render: (data) =>
                React.createElement(ReauthenticationEmail, { token: data.token ?? '' }),
            },
          },
        })
        return handler(request)
      },
    },
  },
})
