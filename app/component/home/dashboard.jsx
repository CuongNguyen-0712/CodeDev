import { useState, useEffect } from "react";

import { FiMoon, FiSun } from "react-icons/fi";
import { PiStudentFill } from 'react-icons/pi';
import { SiGnusocial } from 'react-icons/si';
import { GiReceiveMoney } from "react-icons/gi"
import { GoProjectRoadmap } from "react-icons/go";
import { FaRankingStar } from 'react-icons/fa6';

export default function Dashboard({ isDashboard, isResize, mode, handleContent, handleMode, handleResize }) {

    const [dashboard, setDashboard] = useState({
        targetItem: 1,
        targetListItem: 1,
    })

    useEffect(() => {
        if (isDashboard && isResize) {
            handleResize();
        }
    }, [isDashboard])

    const dashboardList = [
        {
            id: 1,
            name: 'Study',
            tag: 'Study programming courses', 
            icon: <PiStudentFill />,
        },
        {
            id: 2,
            name: 'Roadmap',
            tag: 'Roadmap to learning effectively',
            icon: <GoProjectRoadmap />,
        },
        {
            id: 3,
            name: 'Social',
            tag: 'Connect with social',
            icon: <SiGnusocial />,
        },
        {
            id: 4,
            name: 'Ranking',
            tag: 'Raking to achieve your goals',
            icon: <FaRankingStar />,
        },
        {
            id: 5,
            name: 'Benefit',
            tag: 'Benefit from learning',
            icon: <GiReceiveMoney />,
        }
    ];

    const handleTarget = (key) => {
        setDashboard((state) => ({ ...state, targetItem: key }))
        handleContent(key);
    }

    return (
        <acticle className={`dashboard-target ${(!isResize && isDashboard) ? 'expand' : 'compact'}`}>
            <div id='header-dashboard'>
                <h1>Dashboard</h1>
            </div>
            <div id='main-dashboard'>
                {dashboardList.map((item) => (
                    <div className='container-dashboard' key={item.id} data-text = {item.name}>
                        <button className={`dashboardTitle ${item.id === dashboard.targetItem ? 'active' : ''}` }
                            onClick={() => handleTarget(item.id)}>
                            <span className='icon'>{item.icon}</span>
                            <div className='box-container'>
                                <span className='name'>{item.name}</span>
                                <span className="tag">{item.tag}</span>
                            </div>
                        </button>
                    </div>
                ))}
            </div>

            <footer id='footer-dashboard'>
                <div className={`switchMode ${mode ? 'light' : 'dark'}`}>
                    <span className='mode'>{mode ? 'Light mode:' : 'Dark mode:'}</span>
                    <button className='mode-btn' onClick={() => handleMode()}>
                        <span>{mode ? <FiSun /> : <FiMoon />}</span>
                    </button>
                </div>
            </footer>
        </acticle>
    )
}