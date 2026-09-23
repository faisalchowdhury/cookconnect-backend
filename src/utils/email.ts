import nodemailer from 'nodemailer';
import { env } from '@/config/env';
import { logger } from '@/config/logger';

export type MailOptions = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export interface MailProvider {
  send(options: MailOptions): Promise<void>;
}

class ConsoleMailProvider implements MailProvider {
  async send(options: MailOptions): Promise<void> {
    logger.info('[mail:console]', {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }
}

class SmtpMailProvider implements MailProvider {
  private transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
  });

  async send(options: MailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}

class GmailMailProvider implements MailProvider {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.Nodemailer_GMAIL,
      pass: env.Nodemailer_GMAIL_PASSWORD.replace(/\s+/g, ''),
    },
  });

  async send(options: MailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: env.MAIL_FROM || env.Nodemailer_GMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }
}

class ResendMailProvider implements MailProvider {
  async send(options: MailOptions): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error (${response.status}): ${body}`);
    }
  }
}

function createMailProvider(): MailProvider {
  switch (env.MAIL_DRIVER) {
    case 'smtp':
      return new SmtpMailProvider();
    case 'resend':
      return new ResendMailProvider();
    case 'gmail':
      return new GmailMailProvider();
    case 'console':
    default:
      return new ConsoleMailProvider();
  }
}

const provider = createMailProvider();

export async function sendMail(options: MailOptions): Promise<void> {
  await provider.send(options);
}
