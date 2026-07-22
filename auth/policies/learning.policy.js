import { ACTION } from "../actions";

export default {
    [ACTION.READ]({ user }) {
        return !!user
    },

    [ACTION.LEARN]({ user }) {
        return !!user
    }
}