import { useEffect, useState } from "react"
import { api } from "@/app/lib/axios";
import { FaRocket, FaFlagCheckered, FaLightbulb, FaTools, FaCheckCircle } from "react-icons/fa";

export default function Roadmap() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get("/roadmap")
            if (res.status === 200) {
                setData(res.data)
            }
        }
        catch (error) {
            setData([{ 
                heading: "Opps! Something went wrong", 
                content: "We couldn't load the roadmap at this time. Please try again later." 
            }]);
            console.log(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const getIcon = (index) => {
        const icons = [
            <FaLightbulb />,
            <FaTools />,
            <FaRocket />,
            <FaFlagCheckered />,
            <FaCheckCircle />
        ];
        return icons[index % icons.length];
    }

    return (
        <section className="roadmap-section">
            <div className="roadmap-header">
                <h1>Our Roadmap</h1>
                <p>Discover the journey of our development and what's coming next for our platform.</p>
            </div>

            <div className="roadmap-timeline">
                {loading ? (
                    <div className="roadmap-loading">
                        {[1, 2, 3].map(i => <div key={i} className="skeleton-item" />)}
                    </div>
                ) : (
                    data.map((item, index) => (
                        <div className="roadmap-item" key={index}>
                            <div className="roadmap-dot">
                                {getIcon(index)}
                            </div>
                            <div className="roadmap-content">
                                <h2>
                                    {item.heading}
                                </h2>
                                <p>{item.content}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    )
}
