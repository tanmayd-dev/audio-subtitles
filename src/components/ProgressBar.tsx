interface ProgressBarProps {
    label: string;
    progress: number;  // 0–100
    variant?: 'purple' | 'blue';
}

export function ProgressBar({ label, progress, variant = 'purple' }: ProgressBarProps) {
    return (
        <div className="progress-item">
            <div className="progress-label">
                <span>{label}</span>
                <span>{progress}%</span>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div
                    className={`progress-fill${variant === 'blue' ? ' progress-fill--blue' : ''}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
