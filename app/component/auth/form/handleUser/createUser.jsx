localStorage.setItem('user', []);

export default function CreateUser(name, pass, email) {
    let users = JSON.parse(localStorage.getItem('user') || []);

    const newUser = {
        username: name,
        password : pass,
        email: email,
    }

    users.push(newUser);
    localStorage.setItem('user', JSON.stringify(users));

    return users
}