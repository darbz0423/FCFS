# FCFS Scheduler — React + TypeScript + Tailwind CSS + PHP

A professional First-Come, First-Served CPU scheduling simulator.

## Technology

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, Lucide React
- **Backend:** PHP 8.1+ JSON API
- **Database:** Not required. The simulator calculates schedules in memory.

## Requirements

Install these before running the project:

1. **Node.js 22.12+** (or Node.js 20.19+) and npm.
2. **PHP 8.1 or newer** available in your Windows PATH.
3. VS Code (recommended).

Check the installations in a terminal:

```powershell
node -v
npm -v
php -v
```

## Project structure

```text
FCFS-PHP-React/
├── backend/
│   └── public/
│       └── api/
│           ├── fcfs.php
│           └── health.php
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── README.md
```

## Setup on Windows

Extract the ZIP file. Open the extracted `FCFS-PHP-React` folder in VS Code.

### 1. Start the PHP backend

Open the first VS Code terminal. Make sure the current directory is the project root (`FCFS-PHP-React`), then run:

```powershell
php -S 127.0.0.1:8000 -t backend/public
```

Keep this terminal running. The PHP API is available at:

- Health check: `http://127.0.0.1:8000/api/health.php`
- FCFS endpoint: `http://127.0.0.1:8000/api/fcfs.php` (POST)

Open the health-check address in your browser. It should return JSON with `"status":"ok"`.

### 2. Install and start the React frontend

Open a second VS Code terminal and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the local Vite address shown in the terminal. With the included configuration it should be:

`http://127.0.0.1:5173`

Keep both terminals running while using the application.

## How the frontend reaches PHP

During development, the Vite server proxies requests beginning with `/api` to `http://127.0.0.1:8000`. The React application therefore calls `/api/fcfs.php` and `/api/health.php`; no separate CORS setup is needed for the normal local workflow.

The proxy is configured in `frontend/vite.config.ts`.

## FCFS assumptions and formulas

This version keeps the original simulator's assumptions:

- Every process has arrival time `0`.
- Processes execute in the order shown in the input list.
- FCFS is non-preemptive.

For each process:

- `Start Time = Previous process Completion Time`
- `Waiting Time = Start Time` (because all arrival times are zero)
- `Completion Time = Start Time + Burst Time`
- `Turnaround Time = Completion Time - Arrival Time`

The PHP API validates the request, calculates the schedule, and returns the result metrics. The browser handles the visual playback.

## Useful commands

Inside `frontend/`:

```powershell
npm run dev       # Start the frontend development server
npm run typecheck # Run TypeScript checks
npm run build     # Create a production frontend build
npm run preview   # Preview the production build
```

## Troubleshooting

### `php` is not recognized

PHP is not installed or its folder is not in your Windows PATH. Install PHP for Windows, add the folder containing `php.exe` to PATH, close and reopen VS Code, then run `php -v` again.

### `npm` or `node` is not recognized

Install Node.js, then close and reopen VS Code. Verify with `node -v` and `npm -v`.

### The interface says `PHP API offline`

Check that the backend terminal is still running on port `8000`. Open `http://127.0.0.1:8000/api/health.php` directly to test it.

### Port 8000 is already in use

Stop the other process using port 8000, or change the PHP port and the target in `frontend/vite.config.ts` to the same new port.

### `lucide-react` cannot be resolved

From the `frontend` folder, run `npm install` again. The package is declared in `frontend/package.json`.

## Notes

- There is no Node.js/Express backend in this version.
- No database or Composer packages are required.
- The PHP built-in server is for local development only, not public production hosting.
