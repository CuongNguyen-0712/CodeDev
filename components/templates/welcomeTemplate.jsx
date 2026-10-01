import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Heading,
    Text,
    Img,
} from "@react-email/components";

export default function WelcomeTemplate() {
    return (
        <Html>
            <Head />
            <Preview>Welcome to CodeDev — We're happy to have you!</Preview>

            <Body style={bodyStyle}>
                <Container style={containerStyle}>

                    <Section style={sectionStyle}>
                        <Img
                            src="https://res.cloudinary.com/dex6q1cqh/image/upload/f_png/v1764251020/logo_i8qj61.svg"
                            alt="CodeDev"
                            height="50"
                            width="50"
                            style={{ margin: "0 auto", display: "block" }}
                        />
                    </Section>

                    <Section style={sectionStyle}>
                        <Heading style={headingStyle}>
                            Welcome to CodeDev 🚀
                        </Heading>

                        <Text style={textStyle}>
                            Hi <strong>Developer</strong>,
                        </Text>

                        <Text style={textStyle}>
                            We're excited to have you on board. You'll find tutorials, roadmaps, challenges
                            and everything to help you master programming the right way.
                        </Text>

                        <Text style={textStyle}>
                            Start exploring now and level up your coding journey!
                        </Text>

                        <Section style={buttonWrapperStyle}>
                            <a
                                href="https://code-dev-navy.vercel.app/home"
                                style={buttonStyle}
                            >
                                Start Learning
                            </a>
                        </Section>

                        <Text style={footerStyle}>
                            — The CodeDev Team
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

const bodyStyle = {
    backgroundColor: "#f6f9fc",
    padding: "40px 0",
};

const containerStyle = {
    backgroundColor: "#ffffff",
    padding: "30px",
    borderRadius: "8px",
    maxWidth: "520px",
    margin: "0 auto",
    border: "1px solid #e5e5e5",
};

const sectionStyle = {
    marginBottom: "20px",
};

const headingStyle = {
    fontSize: "24px",
    textAlign: "center",
    margin: "0 0 12px 0",
    fontWeight: "bold",
};

const textStyle = {
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 12px 0",
};

const buttonWrapperStyle = {
    textAlign: "center",
    marginTop: "25px",
    marginBottom: "10px",
};

const buttonStyle = {
    display: "inline-block",
    padding: "12px 24px",
    backgroundColor: "#007bff",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "bold",
    textDecoration: "none",
    borderRadius: "6px",
};

const footerStyle = {
    fontSize: "14px",
    marginTop: "20px",
    color: "#04BADE",
};