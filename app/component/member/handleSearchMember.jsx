export default function HandleSearchMember({value, members}){ 

    const convertValue = (value) => {
        return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();
    }

    const searchValue = convertValue(value)

    if(searchValue === ""){
        return members
    }

    const availableMembers = members.filter(member => {
        const name = convertValue(member.name);
        return name.includes(searchValue)
    })

    return availableMembers
}