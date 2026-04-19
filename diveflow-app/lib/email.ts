import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export async function sendEmailWithAttachment({
  to,
  subject,
  html,
  attachment,
}: {
  to: string;
  subject: string;
  html: string;
  attachment: EmailAttachment;
}) {
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'DiveFlow <noreply@diveflow.app>',
    to,
    subject,
    html,
    attachments: [
      {
        filename: attachment.filename,
        content: attachment.content,
      },
    ],
  });
}
