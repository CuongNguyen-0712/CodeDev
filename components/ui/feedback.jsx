'use client';

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { sendFeedbackAction } from "@/actions/feedback.actions";
import { useQueryParams } from "@/router/useQueryParams";
import { FeedbackSchema } from "@/lib/definition";
import { useApp } from "@/contexts/appContext";
import { validate } from "@/lib/validate";

import { Button } from "@/components/shadcn/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";
import { FieldGroup } from "@/components/shadcn/field";

import { InputGroup, TextAreaGroup } from "./input";

import { LuLoaderCircle, LuSend } from "react-icons/lu";

const EMPTY_FORM = { title: "", feedback: "" };

// Opened from the sidebar and account menu through `?modal=feedback`.
export default function Feedback() {
    const { showAlert: alert } = useApp();
    const updateQuery = useQueryParams();
    const params = useSearchParams();

    const isOpen = params.get('modal') === 'feedback';

    const [state, setState] = useState({ error: null, handling: false });
    const [dataForm, setDataForm] = useState(EMPTY_FORM);

    const handleClose = () => {
        if (state.handling) return;
        updateQuery({ modal: null });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const { success, errors } = validate(FeedbackSchema, dataForm);
        if (!success) {
            setState((prev) => ({ ...prev, error: errors }));
            return;
        }

        if (state.handling) return;

        setState((prev) => ({ ...prev, handling: true }));

        try {
            const response = await sendFeedbackAction(dataForm);
            if (response.success) {
                alert(200, "Thanks, your feedback was sent.");
                setDataForm(EMPTY_FORM);
                setState({ error: null, handling: false });
                updateQuery({ modal: null });
            } else {
                alert(response.status || 500, response.message || "Failed to submit feedback");
                setState((prev) => ({ ...prev, handling: false }));
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || "An error occurred while submitting feedback");
            setState((prev) => ({ ...prev, handling: false }));
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        const nextUpdate = { ...dataForm, [name]: value };
        const { errors } = validate(FeedbackSchema, nextUpdate);

        setDataForm(nextUpdate);
        setState((prev) => {
            const { [name]: removed, ...rest } = prev.error || {};
            return errors?.[name]
                ? { ...prev, error: { ...prev.error, [name]: errors[name] } }
                : { ...prev, error: rest };
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleSubmit} noValidate className="grid gap-5">
                    <DialogHeader>
                        <DialogTitle>Send feedback</DialogTitle>
                        <DialogDescription>
                            Tell us what is working, what is broken, or what you would like to see next.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup className="gap-4">
                        <InputGroup
                            name="title"
                            label="Summary"
                            placeholder="One line about your feedback"
                            value={dataForm.title}
                            onChange={handleChange}
                            error={state.error?.title}
                            reset={() => setDataForm((prev) => ({ ...prev, title: "" }))}
                            disabled={state.handling}
                        />
                        <TextAreaGroup
                            name="feedback"
                            label="Details"
                            placeholder="What happened, where, and what you expected instead"
                            rows={5}
                            value={dataForm.feedback}
                            onChange={handleChange}
                            error={state.error?.feedback}
                            disabled={state.handling}
                        />
                    </FieldGroup>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={handleClose} disabled={state.handling}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={state.handling}>
                            {state.handling ? <LuLoaderCircle className="animate-spin" /> : <LuSend />}
                            {state.handling ? 'Sending...' : 'Send feedback'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
