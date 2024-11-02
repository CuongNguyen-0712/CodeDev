import { useRouter } from "next/navigation";
export default function RouterPush(){
    const router = useRouter(); 

    const navigateToHome = () => {
        router.push('/');
    }

    const navigateToMember = () => {
        router.push('/member');
    }

    const navigateToComment = () => {
        router.push('/comment');
    }

    return {navigateToHome, navigateToMember, navigateToComment};
}
