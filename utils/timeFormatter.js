export function formatRelativeTime(dateString) {
    const diffInSeconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    const units = [
        { label: "year", value: 31536000 },
        { label: "month", value: 2592000 },
        { label: "day", value: 86400 },
        { label: "hour", value: 3600 },
        { label: "minute", value: 60 },
        { label: "second", value: 1 },
    ];

    for (const { label, value } of units) {
        if (diffInSeconds >= value) {
            return rtf.format(-Math.floor(diffInSeconds / value), label);
        }
    }
    return "just now";
}
