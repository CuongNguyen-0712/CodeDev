export default function LoadingWait() {
    return (
        <main id="main" style={{ background: '#fff' }}>
            <div id="load">
                <div className="shape">
                    <div className='square'></div>
                    <div className="circle"></div>
                </div>
                <span>Loading</span>
            </div>
        </main>
    )
}