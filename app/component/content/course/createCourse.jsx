import { useEffect, useState } from "react";

import Image from "next/image"

import { IoTerminal } from "react-icons/io5";
import { FaCopy, FaTrash, FaArrowLeft, FaArrowRight, FaCircleNotch, FaRegCheckCircle } from "react-icons/fa";
import { IoIosPlay } from "react-icons/io";

export default function CreateCourse({ data, handle }) {

    const { id, file, concept, icon, title, code } = data;

    const [isRun, setRun] = useState(false);
    const [isCopy, setCopy] = useState(true);
    const [console, setConsole] = useState(false);

    useEffect(() => {
        let lineIndex = 0;
        let charIndex = 0;
        const lines = code.trim().split("\n");
        const showChars = (visibleLine) => {
            const visibleChar = visibleLine.split("");

            const handleVisibleChar = setInterval(() => {
                if (charIndex >= visibleChar.length) {
                    clearInterval(handleVisibleChar);
                    charIndex = 0;
                    lineIndex++;

                    if (lineIndex < lines.length) {
                        showLine();
                    }
                    else {
                        setRun(true)
                    }
                }
                else {
                    const visibleElement = document.querySelector(`li[data-line="${lineIndex}"] span[data-char="${charIndex}"]`);
                    if (visibleElement) {
                        visibleElement.style.transform = "scaleY(1)";
                    }
                    charIndex++;
                }

                return () => clearInterval(handleVisibleChar)
            }, 50);
        };

        const showLine = () => {
            if (lineIndex >= lines.length) {
                return;
            }

            const visibleLine = lines[lineIndex].trim();

            showChars(visibleLine);
        };

        showLine();

        return () => {
            lineIndex = 0;
            charIndex = 0;
        };
    }, [data]);

    const handleCopy = (text) => {
        if (isCopy) {
            navigator.clipboard.writeText(text).then(
                setCopy(false),
                setTimeout(() => {
                    setCopy(true)
                }, 1000)
            )
        }
    }

    return (
        <div className="frame-course" id={id}>
            <div className="view-code" >
                <div className="heading-code">
                    <div className="part">
                        <IoTerminal />
                        <span>Terminal</span>
                    </div>
                    <span className="file">{file}</span>
                    {
                        isCopy ?
                            <span className="copy" onClick={() => handleCopy(code)}>
                                <FaCopy />
                            </span>
                            :
                            <span className="check">
                                <FaRegCheckCircle />
                            </span>
                    }
                </div>
                <ul className="source-code">
                    <div className="row-num">
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5</span>
                        <span>6</span>
                        <span>7</span>
                        <span>8</span>
                        <span>9</span>
                        <span>10</span>
                        <span>11</span>
                    </div>
                    <div className="code">
                        {code.trim().split('\n').map((item, index) => (
                            <li key={index} data-line={index}>
                                {item.trim().split("").map((char, index) => (
                                    <span key={index} data-char={index}>{char === " " ? '\u00A0' : char}</span>
                                ))}
                            </li>
                        ))}
                    </div>

                    <div className={`console ${console ? "active" : ""}`}>
                        <span onClick={() => setConsole(false)}>
                            <FaTrash />
                        </span>
                    </div>

                    {isRun && <button className="run-code" onClick={() => setConsole(true)}>
                        {console ?
                            <FaCircleNotch className="loading" />
                            :
                            <>
                                <IoIosPlay />
                                <span>Run</span>
                            </>
                        }
                    </button>}
                </ul>
            </div>
            <div className="intro-course">
                <div className="intro-heading">
                    <Image
                        src={icon}
                        alt="image-course"
                        width={100}
                        height={100}
                        quality={100}
                        className="image-course"
                        priority
                    />
                    <span className="title-course">{title}</span>
                </div>
                <div className="intro-body">
                    <p>{concept}</p>
                    <button id="join">
                        Join course
                    </button>
                </div>
                <div className="handle-course">
                    <button onClick={() => handle(-1)}>
                        <FaArrowLeft />
                    </button>
                    <button onClick={() => handle(1)}>
                        <FaArrowRight />
                    </button>
                </div>
            </div >
        </div>
    )
}