import { useEffect, useState } from "react"

import axios from "axios";

export default function Roadmap() {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const res = await axios.get("/api/roadmap")
            if(res.status !== 200){
                throw new Error("Failed to fetch data");
            } 
            const data = res.data;
            setData(data);
        }

        try{
            fetchData();
        }
        catch{
            throw new Error("Failed to fetch data");
        }
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
