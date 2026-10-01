import { FaBook, FaFire, FaGraduationCap } from "react-icons/fa";

export const levelMapping = {
    'beginner': { label: 'Beginner', color: 'var(--emerald-500)', bg: 'rgba(34, 197, 94, 0.1)' },
    'intermediate': { label: 'Intermediate', color: 'var(--orange-500)', bg: 'rgba(251, 191, 36, 0.1)' },
    'advanced': { label: 'Advanced', color: 'var(--blue-500)', bg: 'rgba(59, 130, 246, 0.1)' },
    'expert': { label: 'Expert', color: 'var(--purple-500)', bg: 'rgba(147, 51, 234, 0.1)' },
    'master': { label: 'Master', color: 'var(--rose-500)', bg: 'rgba(244, 63, 94, 0.1)' },
}

export const progressMapping = {
    'enrolled': { label: 'Enrolled', className: 'enrolled', color: 'var(--blue-500)', icon: <FaBook /> },
    'in_progress': { label: 'In Progress', className: 'in-progress', color: 'var(--amber-500)', icon: <FaFire /> },
    'completed': { label: 'Completed', className: 'completed', color: 'var(--emerald-500)', icon: <FaGraduationCap /> },
};