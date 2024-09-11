export default function CreateStudy({ props, link }) {
    const { title, concept, benefit, image, courses, prepare } = props

    return (
        <div className="study-container" id={link}>
            <header className="study-heading">
                <div className="study-header">
                    <img src={image} alt="image-topic" className="image" />
                    <span className="study-title">{title}</span>
                </div>
                <div className="course-frame">
                    <span className="name">Course</span>
                    {courses && courses.map((item, index) =>
                        <div className="course" key={index}>
                            <span className="course-name">{item.course_name}</span>
                            <p className="course-text">{item.course}</p>
                            <button className="course-link">
                                <a href={item.link_course} target="_blank" rel="noopener noreferrer">{item.link_name}</a>
                            </button>
                        </div>
                    )}
                </div>
            </header>
            <div className="study-content">
                <div className="study-body">
                    <span className="name">Concept</span>
                    <p className="concept">{concept}</p>
                    <span className="name">Benefit</span>
                    <div className="benefit">
                        {benefit && benefit.map((item, index) =>
                            <div className="benefit-frame" key={index}>
                                <span className="benefit-name">{item.benefit_name}</span>
                                <p className="benefit-text">{item.benefit_text}</p>
                            </div>
                        )}
                    </div>
                </div>
                <footer className="study-footer">
                    <span className="name">Prepare</span>
                    {prepare && prepare.map((item, index) =>
                        <div className="prepare" key={index}>
                            <span className="prepare-name">{item.focus_name}</span>
                            <p className="prepare-item">{item.focus}</p>
                        </div>
                    )}
                </footer>
            </div>
        </div>
    )
}
