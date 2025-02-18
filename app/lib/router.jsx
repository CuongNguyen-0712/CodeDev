import { useRouter } from "next/navigation";

export default function RouterPush() {
    const router = useRouter();

    const navigateToCurrent = () => {
        router.push('/', { shalow: true });
    }

    const navigateToHome = () => {
        router.push('/home', { shalow: true });
    }

    const navigateToAuth = () => {
        router.push('/auth', { shalow: true });
    }

    const navigateToMember = () => {
        router.push('/home/member', { shalow: true });
    }

    const navigateToCourse = () => {
        router.push('/home/course', { shalow: true });
    }

    const navigateToEvent = () => {
        router.push('/home/event', { shalow: true });
    }

    return { navigateToCurrent, navigateToHome, navigateToAuth, navigateToMember, navigateToCourse, navigateToEvent };
}