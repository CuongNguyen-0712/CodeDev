import { useEffect, useState, useContext, createContext } from "react"
import { useRouter } from 'next/navigation';
import Loading from "@/app/function/loading";

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
}

export const AuthProvider = ({ children }) => {

    const [accounts, setAccounts] = useState([]);
    const [authState, setAuthState] = useState({
        currentAccount: {
            username: null,
            password: null,
            access_level: null,
        },
        isAuthState: false,
        isLoading: false,
        isLogout: false,
        isLogin: false,
    });

    const router = useRouter();

    const fecthDataAccounts = async () => {
        fetch("/data/accountList.json")
            .then((res) => res.json())
            .then((data) => {
                setAccounts(data);
                setAuthState(prevState => ({ ...prevState, isLoading: false }));
            })
            .catch(err => {
                console.error("Failed to fetch accounts:", err);
                setAuthState(prevState => ({ ...prevState, isLoading: false }));
            });
    }

    useEffect(() => {
        fecthDataAccounts();
    }, []);

    const handleLogin = ({ name, pass, level }) => {
        setAuthState(prevState => ({
            ...prevState,
            isLoading: true,
            isLogout: false,
            isLogin: true,
            isAuthState: true,
            currentAccount: {
                username: name,
                password: pass,
                access_level: level,
            }
        }));

        router.push('/main');
    };
    const handleLogout = () => {
        setAuthState(prevState => ({
            ...prevState,
            isLoading: true,
            isLogout: true,
            isLogin: false,
            currentAccount: {
                username: null,
                password: null,
                access_level: null,
            },
            isAuthState: false,
        }))

        router.push('/');
    }

    const loginWithCredentials = async ({ name, pass }) => {
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const accountLogin = accounts.find(account => account.username === name && account.password === pass);

            if (accountLogin) {
                console.table(accountLogin)
                handleLogin({ name: accountLogin.username, pass: accountLogin.password, level: accountLogin.access_level });
            } else {
                alert("Tài khoản hoặc mật khẩu không đúng!");
                setAuthState(prevState => ({ ...prevState, isLoading: false }));
            }
        }
        catch (err) {
            console.log(err)
            setAuthState(prevState => ({ ...prevState, isLoading: false }));
        }
    };

    if (authState.isLoading) {
        return (
            <Loading />
        );
    }

    return (
        <AuthContext.Provider
            value=
            {{
                handleLogout,
                loginWithCredentials,
                account: authState.currentAccount,
            }}>
            {children}
        </AuthContext.Provider>
    )
}