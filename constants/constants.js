import { FaBook, FaFire, FaGraduationCap } from "react-icons/fa";

export const levelMapping = {
    'beginner': { label: 'Beginner', variant: 'success', color: 'var(--success)', bg: 'var(--success-soft)' },
    'intermediate': { label: 'Intermediate', variant: 'warning', color: 'var(--warning)', bg: 'var(--warning-soft)' },
    'advanced': { label: 'Advanced', variant: 'info', color: 'var(--info)', bg: 'var(--info-soft)' },
    'expert': { label: 'Expert', variant: 'primary', color: 'var(--primary)', bg: 'var(--primary-soft)' },
    'master': { label: 'Master', variant: 'destructive', color: 'var(--destructive)', bg: 'var(--destructive-soft)' },
};

export const progressMapping = {
    'enrolled': { label: 'Enrolled', className: 'enrolled', variant: 'info', color: 'var(--info)', icon: <FaBook /> },
    'in_progress': { label: 'In Progress', className: 'in-progress', variant: 'warning', color: 'var(--warning)', icon: <FaFire /> },
    'completed': { label: 'Completed', className: 'completed', variant: 'success', color: 'var(--success)', icon: <FaGraduationCap /> },
};