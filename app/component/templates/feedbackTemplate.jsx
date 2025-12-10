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

export default function FeedbackTemplate() {
    return (
        <Html>
            <Head />
            <Preview>Thank you for your feedback!</Preview>

            <Body style={bodyStyle}>
                <Container style={containerStyle}>
                    <Section>
                        <Img
                            src="https://res.cloudinary.com/dex6q1cqh/image/upload/f_png/v1764251020/logo_i8qj61.svg"
                            alt="CodeDev"
                            height="50"
                            width="50"
                            style={{ margin: "0 auto", display: "block" }}
                        />
                    </Section>

                    <Section style={sectionStyle}>
                        <Heading style={headingStyle}>Thanks for your feedback!</Heading>

                        <Text style={textStyle}>
                            We really appreciate you taking the time to let us know your thoughts.
                            Your feedback helps us improve CodeDev and provide a better experience.
                        </Text>

                        <Text style={textStyle}>
                            Keep exploring and learning with CodeDev 🚀
                        </Text>

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
    fontSize: "22px",
    textAlign: "center",
    margin: "0 0 12px 0",
    fontWeight: "bold",
};

const textStyle = {
    fontSize: "15px",
    lineHeight: "22px",
    margin: "0 0 12px 0",
};

const footerStyle = {
    fontSize: "14px",
    marginTop: "20px",
    color: "#04BADE",
};