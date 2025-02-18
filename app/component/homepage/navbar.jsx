import { FaListUl } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";

export default function Navbar({ onIpad, onMobile, handleOverlay, sizeDevice }) {

    const { width, height } = sizeDevice

    return (
        <nav id='navbar'>
            <div className="navbar-items">
                <div className="navbar-feature" style={{ width: onIpad && "50%", width: onMobile && 'max-content' }}>
                    {width <= 768 &&
                        <button className="menu-btn" onClick={handleOverlay} >
                            <FaListUl />
                        </button>
                    }
                </div>
                <button className="search">
                    <span>
                        <IoSearch />
                    </span>
                    {width > 500 &&
                        <span>
                            Search
                        </span>
                    }
                </button>
            </div>
        </nav>
    )
}