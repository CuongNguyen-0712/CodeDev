export function ErrorReload({ data, refetch }) {
    const { status, message } = data
    return (
        <div id="error">
            <p>Error {status}: {message}</p>
            <button onClick={refetch}>Reload</button>
        </div>
    )
}