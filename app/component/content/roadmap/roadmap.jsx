import { useEffect, useState } from "react"

import axios from "axios";

export default function Roadmap() {
    const [data, setData] = useState([]);

    const fetchData = async () => {
        try {
            const res = await axios.get("/api/roadmap")
            if(res.status === 200){
                const data = res.data;
                setData(data)
            }
            else if(res.status === 500){
                setData([{heading: "Something is wrong", content: "Failed to load content"}]);
                throw new Error("Failed to load content")
            }
        }
        catch(error){
            setData([{heading: "Something is wrong", content: "Failed to load content"}]);
            console.log(error);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    return (
        <>
            <h1>roadmap</h1>
            {data.map((item, index) => (
                <div key={index}>
                    <h1>{item.heading}</h1>
                    <p>{item.content}</p>
                </div>
            ))}
        </>
    )
}
