import { NextResponse } from 'next/server';

import nodemailer from 'nodemailer';
import { render } from '@react-email/render';

import WelcomeTemplate from '@/app/component/templates/welcomeTemplate';
import FeedbackTemplate from '@/app/component/templates/feedbackTemplate';

export async function POST(req) {
    try {
        const data = await req.json();

        const templates = {
            welcome: WelcomeTemplate,
            feedback: FeedbackTemplate
        };

        const Template = templates[data.type];

        if (!Template) throw new Error('Template not found');
        if (!data.to) throw new Error('Recipient email is required');

        const html = await render(<Template />);

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await new Promise((resolve, reject) => {
            transporter.sendMail(
                {
                    from: `CodeDev <${process.env.EMAIL_USER}>`,
                    to: 'trannguyenthanhtruc050@gmail.com',
                    subject: data.subject || 'No Subject',
                    html,
                },
                (err) => (err ? reject(err) : resolve())
            );
        });

        return new NextResponse({ success: true }, { status: 200 })
    } catch (error) {
        console.error('Email send error:', error);
        return new NextResponse({ success: false }, { status: 500 })
    }
}
