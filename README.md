# Kingshot Alliance Management

A Next.js-based platform for managing players and organizing events across Swordland and Tri Alliance with legion management capabilities.

## Features

- **Landing Page**: Welcome screen with navigation to Players and Events
- **Players Management**: Create, read, update, and delete player profiles with Swordland and Tri Alliance power levels
- **Events Management**: Organize events for Swordland and Tri Alliance
- **Legion Management**: Assign players to different legions/alliances with power-based organization
- **Dark Theme**: Modern dark mode interface with module-based CSS
- **GitHub Pages Deployment**: Automated deployment using GitHub Actions

## Tech Stack

- **Framework**: Next.js 16.2.4
- **Language**: TypeScript
- **Styling**: CSS Modules with dark theme
- **Runtime**: Node.js

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Landing page
│   ├── page.module.css    # Landing page styles
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   ├── players/           # Players management page
│   ├── events/            # Events listing page
│   ├── swordland/         # Swordland event management
│   └── tri-alliance/      # Tri Alliance event management
├── components/            # Reusable components
│   ├── Navigation.tsx
│   ├── Dialog.tsx
│   ├── PlayerForm.tsx
│   ├── PlayersTable.tsx
│   └── LegionManager.tsx
├── data/                  # JSON data files
│   └── players.json
├── types/                 # TypeScript type definitions
│   └── index.ts
└── utils/                 # Utility functions
    └── playerService.ts
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Building

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Features in Detail

### Landing Page
- Welcome message with Kingshot Alliance Management branding
- Two CTAs: Players and Events
- Responsive design with featured image

### Players Management
- View all players in a table format
- Columns: Player ID, Name, Swordland, Tri Alliance, Power, Actions
- Add new players with dialog form
- Edit existing players
- Delete players
- Form validation

### Events
- Two event cards: Swordland and Tri Alliance
- Navigate to event-specific management pages

### Swordland & Tri Alliance Management
- Main table showing all unassigned players
- Two side tables for Legion 1 and Legion 2
- Dropdown selectors to move players between legions
- Display player power (Swordland or Tri Alliance specific)
- Generate string button to create formatted output
- Save button to store legion configurations
- TextArea to display generated strings

## Data Management

Currently, the application uses JSON files for data storage:
- `src/data/players.json`: Player database

To implement persistent storage, you can:
1. Connect to a backend API
2. Use a database (MongoDB, PostgreSQL, etc.)
3. Integrate with a headless CMS

## Deployment

### GitHub Pages Deployment

The project is configured for automatic deployment to GitHub Pages using GitHub Actions.

**Setup Instructions:**

1. Push your code to GitHub
2. Go to your repository settings
3. Navigate to Pages
4. Set source to "GitHub Actions"
5. The workflow will automatically deploy on every push to main branch

**Manual Deployment:**

```bash
npm run build
# The static site will be in the 'out' directory
```

## Styling

The project uses CSS Modules with a dark theme. Global CSS variables are defined in `src/app/globals.css`:

```css
--bg-primary: #1a1a1a
--bg-secondary: #2a2a2a
--bg-tertiary: #3a3a3a
--text-primary: #ffffff
--text-secondary: #b0b0b0
--border-color: #404040
--accent-color: #6366f1
--accent-hover: #4f46e5
--danger-color: #ef4444
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Future Enhancements

- [ ] Backend API integration
- [ ] Database integration
- [ ] User authentication
- [ ] Real-time updates
- [ ] Export/Import functionality
- [ ] Advanced player filtering and search
- [ ] Statistics and analytics dashboard
- [ ] Event history and archiving

## License

This project is private and proprietary to Kingshot Alliance Management.

## Support

For issues or questions, please create an issue in the repository.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Kingshot-Alliance-Management
