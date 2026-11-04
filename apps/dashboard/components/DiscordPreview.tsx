"use client";
export default function DiscordPreview({
  title,
  description,
  image,
  buttons = [],
  accent = "#d9aa3c",
  author = "Band of Misfits",
  footer = "Band of Misfits · Live preview",
  componentsV2 = false,
  welcomeName,
  welcomeAvatar,
}: {
  title: string;
  description?: string;
  image?: string | null;
  buttons?: string[];
  accent?: string;
  author?: string;
  footer?: string;
  componentsV2?: boolean;
  welcomeName?: string;
  welcomeAvatar?: string | null;
}) {
  const buttonRow =
    buttons.length > 0 ? (
      <div className="discordPreviewButtons">
        {buttons.map((b, i) => (
          <button
            key={b}
            className={
              welcomeName
                ? i === 0
                  ? "green"
                  : i === 2
                    ? "blue"
                    : "gray"
                : i === 1
                  ? "green"
                  : i === 2
                    ? "blue"
                    : "gray"
            }
          >
            {welcomeName && (
              <img src={`/branding/defaults/emojis/bom_${["apply", "trade", "diplomacy"][i]}.png`} alt="" />
            )}
            {b}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <div className="discordPreviewShell">
      <div className="discordPreviewTop">
        <span className="discordBotAvatar">
          <img src="/branding/defaults/bom-logo.png" alt="" />
        </span>
        <span>
          <b>{author}</b> <em>APP</em>
          <small>Preview</small>
        </span>
      </div>
      {componentsV2 ? (
        <div
          className="discordPreviewV2"
          style={{ borderLeftColor: accent }}
          aria-label="Discord Components v2 preview"
        >
          {image && (
            <div className={`discordPreviewMedia v2Media${welcomeName ? " welcomeArtworkPreview" : ""}`}>
              <img src={image} alt="Preview artwork" />
              {welcomeName && (
                <span className="welcomePreviewTitle">
                  Welcome, <strong>{welcomeName}</strong>
                </span>
              )}
              {welcomeAvatar && (
                <img className="welcomePreviewAvatar" src={welcomeAvatar} alt="Latest joining member" />
              )}
            </div>
          )}
          {!welcomeName && (
            <div className="discordPreviewCopy v2Copy">
              <h4>{title}</h4>
              {description && <p>{description}</p>}
            </div>
          )}
          {buttonRow}
        </div>
      ) : (
        <>
          <div className="discordPreviewEmbed" style={{ borderLeftColor: accent }}>
            <div className="discordPreviewCopy">
              <h4>{title}</h4>
              {description && <p>{description}</p>}
            </div>
            {image && (
              <div className="discordPreviewMedia">
                <img src={image} alt="Preview artwork" />
              </div>
            )}
            <small>{footer}</small>
          </div>
          {buttonRow}
        </>
      )}
      {componentsV2 && (
        <small className="discordPreviewMode">Components v2 container · media gallery + action row</small>
      )}
    </div>
  );
}
