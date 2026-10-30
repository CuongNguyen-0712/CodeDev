import { readFileSync } from "node:fs";

// StudyCircle - the study-group app the hackathon team generated with a coding agent.
// Prompt sent to the agent: "Add an API route so learners can edit their study group's name,
// description and meeting time. Only signed-in users should be able to edit groups."
// The agent wrote updateGroup below (PATCH /api/groups/:id). It compiles, the demo worked,
// and it is about to go live for every CodeDev learner.
//
// The rules the route must follow are in the challenge description.
// Do not change the types, the GroupDb interface or the test runner.

type Role = "learner" | "admin";

interface Session {
    userId: string;
    role: Role;
}

interface StudyGroup {
    id: string;
    courseId: string;
    ownerId: string;
    name: string;
    description: string;
    meetingTime: string;
    updatedBy: string;
}

interface GroupChanges {
    name?: string;
    description?: string;
    meetingTime?: string;
}

interface UpdateRequest {
    session: Session | null; // resolved from the session cookie; null when nobody is signed in
    groupId: string;
    changes: GroupChanges;
}

interface ApiResponse {
    status: number;
    body: StudyGroup | { error: string };
}

interface GroupDb {
    find(id: string): StudyGroup | undefined; // returns a copy of the stored row
    save(group: StudyGroup): void; // replaces the stored row with the same id
}

// PATCH /api/groups/:id
function updateGroup(request: UpdateRequest, db: GroupDb): ApiResponse {
    // Only signed-in users can edit groups.
    if (request.session === null) {
        return { status: 401, body: { error: "Sign in to edit a study group" } };
    }

    const group = db.find(request.groupId);
    if (group === undefined) {
        return { status: 404, body: { error: "Study group not found" } };
    }

    // Only the group's owner, or an admin, may change it. The owner comes from the stored row,
    // never from the request. Checked before anything is written.
    const isOwner = group.ownerId === request.session.userId;
    const isAdmin = request.session.role === "admin";
    if (!isOwner && !isAdmin) {
        return { status: 403, body: { error: "Only the group's owner or an admin can edit it" } };
    }

    const updated: StudyGroup = {
        ...group,
        name: request.changes.name ?? group.name,
        description: request.changes.description ?? group.description,
        meetingTime: request.changes.meetingTime ?? group.meetingTime,
        updatedBy: request.session.userId,
    };
    db.save(updated);
    return { status: 200, body: updated };
}

// ---------------------------------------------------------------- test runner (do not change)
// Fake database: an in-memory table of study groups. It counts every write.
class FakeGroupDb implements GroupDb {
    private readonly rows = new Map<string, StudyGroup>();
    writes = 0;

    constructor(groups: StudyGroup[]) {
        for (const group of groups) this.rows.set(group.id, { ...group });
    }

    find(id: string): StudyGroup | undefined {
        const row = this.rows.get(id);
        return row === undefined ? undefined : { ...row };
    }

    save(group: StudyGroup): void {
        this.writes++;
        this.rows.set(group.id, { ...group });
    }

    dump(): string[] {
        return [...this.rows.values()]
            .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .map((g) => `${g.id} owner=${g.ownerId} name=${g.name} meeting=${g.meetingTime} description=${g.description} updatedBy=${g.updatedBy}`);
    }
}

interface TestInput {
    groups: StudyGroup[];
    requests: UpdateRequest[];
}

const input: TestInput = JSON.parse(readFileSync(0, "utf8"));
const db = new FakeGroupDb(input.groups);
const statuses = input.requests.map((request) => updateGroup(request, db).status);
console.log(JSON.stringify({ statuses: statuses.join(" "), writes: db.writes, stored: db.dump() }));
