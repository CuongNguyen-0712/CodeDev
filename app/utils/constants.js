import { FaBook, FaFire, FaGraduationCap } from "react-icons/fa";


export const levelMapping = {
    'beginner': { label: 'Beginner', color: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.1)' },
    'intermediate': { label: 'Intermediate', color: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.1)' },
    'advanced': { label: 'Advanced', color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.1)' },
    'expert': { label: 'Expert', color: 'var(--purple-500)', bg: 'rgba(168, 85, 247, 0.1)' },
    'master': { label: 'Master', color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.1)' },
}

export const progressMapping = {
    'enrolled': { label: 'Enrolled', value: 'enrolled', color: 'var(--color-primary)', icon: <FaBook /> },
    'in_progress': { label: 'In Progress', value: 'in_progress', color: 'var(--color-accent-orange)', icon: <FaFire /> },
    'completed': { label: 'Completed', value: 'completed', color: 'var(--color-success)', icon: <FaGraduationCap /> },
};