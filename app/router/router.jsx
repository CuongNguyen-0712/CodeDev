import { useRouter } from "next/navigation";

export default function RouterPush(){
    const router = useRouter(); 

    const navigateToCurrent = () => {
        router.push('/', {shalow : true});
    }

    const navigateToHome = () => {
        router.push('/home', {shalow : true});
    }

    const navigateToMember = () => {
        router.push('/member',{shalow : true});
    }

    const navigateToCourse = () => {
        router.push('/course', {shalow : true});
    }

    const navigateToEvent = () => {
        router.push('/event', {shalow : true});
    }

    return {navigateToCurrent, navigateToHome, navigateToMember, navigateToCourse, navigateToEvent};
}
