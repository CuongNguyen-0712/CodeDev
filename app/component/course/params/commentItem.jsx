const CommentItem = ({ data, alert }) => {
    const [state, setState] = useState({
        upvotes: Number(data.upvotes),
        downvotes: Number(data.downvotes)
    })

    const [flag, setFlag] = useState({
        upvotes: data.voting === true,
        downvotes: data.voting === false,
    })

    const formatDate = (str) => {
        const now = new Date();
        const date = new Date(str);
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 5) {
            return 'Just now';
        } else if (diffInSeconds < 60) {
            return `${diffInSeconds} seconds ago`;
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        }
        else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }
    };

    const handleVoting = async (e) => {
        e.stopPropagation();

        const name = e.currentTarget.name;

        const previousFlag = flag;
        const previousState = state;

        let newFlag = { ...flag };
        let newState = { ...state };

        const current =
            flag.upvotes
                ? "upvotes"
                : flag.downvotes
                    ? "downvotes"
                    : null;

        if (current !== name) {
            newFlag = {
                upvotes: false,
                downvotes: false,
                [name]: true,
            };

            newState[name] = (newState[name] || 0) + 1;

            if (current) {
                newState[current] = (newState[current] || 0) - 1;
            }
        } else {
            newFlag[name] = !newFlag[name];

            newState[name] =
                (newState[name] || 0) + (newFlag[name] ? 1 : -1);
        }

        setFlag(newFlag);
        setState(newState);

        try {
            const response = await api.patch(
                "update/updateVotingComment",
                {
                    commentId: data.id,
                    voting:
                        newFlag.upvotes
                            ? true
                            : newFlag.downvotes
                                ? false
                                : null,
                }
            );

            if (!response.data.success) {
                setFlag(previousFlag);
                setState(previousState);
            }
        } catch {
            setFlag(previousFlag);
            setState(previousState);
        }
    };

    return (
        <div className="comment-card">
            <Link className="comment-header" href={`/profile/${data.user_id}`} title={data.username}>
                <img
                    className="comment-avatar"
                    src={data.avatar}
                    alt={data.username}
                    height={44}
                    width={44}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />
                <div className="comment-user-info">
                    <h4 className="comment-username">{data.username}</h4>
                    <span className="comment-date">{formatDate(data.created_at)}</span>
                </div>
            </Link>
            <div className="comment-body">
                <p className="comment-text">{data.comment}</p>
                <div className="comment-actions">
                    <button
                        name="upvotes"
                        onClick={handleVoting}
                        className={`vote-btn upvote ${flag.upvotes ? 'active' : ''}`}
                    >
                        <FaThumbsUp fontSize={14} />
                        <span>{state.upvotes}</span>
                    </button>
                    <button
                        name="downvotes"
                        onClick={handleVoting}
                        className={`vote-btn downvote ${flag.downvotes ? 'active' : ''}`}
                    >
                        <FaThumbsDown fontSize={14} />
                        <span>{state.downvotes}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}