import { useAuth } from "../../handleAuth/authContext";

const users = [];
export default function CreateUser(name, pass, email, level) {
    const { fetchDataAccounts } = useAuth();
    
    const newUser = {
        username: name,
        password: pass,
        access_level: level,
        email: email
    }

    if(!name || !pass || !email){
        alert('Vui lòng điền đầy đủ thông tin')
        return false
    }

    if(email.indexOf('@') === -1){
        alert('Email phải có @')
        return false
    }

    if(pass.length < 8){
        alert('Mật khẩu phải nhiều hơn 8 ký tự')
        return false
    }

    const specicalChar = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/; 
    const number = /[0-9]/;
    const char = /[a-zA-Z]/;

    if(!specicalChar.test(pass)){
        alert('Mật khẩu phải có ký tự đặc biệt')
        return false
    }

    if(!number.test(pass)){
        alert('Mật khẩu phải có ký tự số')
        return false
    }

    if(!char.test(pass)){
        alert('Mật khẩu phải có ký tự chữ')
        return false
    }

    users.forEach(user => {
        if(user.email === email){
            alert('Email đã tồn tại')
            return false
        }
    })

    users.push(newUser)
    
    console.log(users)
    fetchDataAccounts(users)

    alert("Đăng kí tài khoản thành công !")

    return true
}