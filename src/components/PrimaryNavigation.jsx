import { Icon } from "@iconify/react";

const tabs = [
  { id: "home", label: "Home", icon: "home-2" },
  { id: "courses", label: "Courses", icon: "book-bookmark" },
  { id: "community", label: "Community", icon: "users-group-rounded" },
  { id: "profile", label: "Profile", icon: "user-circle" },
];

export default function PrimaryNavigation({ activeTab, onNavigate, hidden }) {
  return (
    <nav
      className="primary-navigation"
      aria-label="Main navigation"
      hidden={hidden}
    >
      <div className="navigation-brand" aria-hidden="true">
        <img src="/clemency-icon.png" alt="" width="48" height="48" />
        <span>
          IHYA<small>ARABIC</small>
        </span>
      </div>
      <div className="navigation-items">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <Icon
              icon={`solar:${tab.icon}-${activeTab === tab.id ? "bold" : "linear"}`}
              aria-hidden="true"
            />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <p className="navigation-note">
        A little Arabic,
        <br />
        every day.
      </p>
    </nav>
  );
}
