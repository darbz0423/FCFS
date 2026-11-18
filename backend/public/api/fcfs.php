<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
];

if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

function respond(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond([
        'message' => 'Method not allowed. Use POST.',
    ], 405);
}

$rawBody = file_get_contents('php://input');
$input = json_decode($rawBody ?: '', true);

if (!is_array($input)) {
    respond(['message' => 'Request body must be valid JSON.'], 400);
}

$processes = $input['processes'] ?? null;

if (!is_array($processes) || count($processes) === 0) {
    respond(['message' => 'Please provide at least one process.'], 422);
}

if (count($processes) > 50) {
    respond(['message' => 'A maximum of 50 processes is allowed.'], 422);
}

$normalizedProcesses = [];
$seenIds = [];

foreach ($processes as $index => $process) {
    if (!is_array($process)) {
        respond([
            'message' => 'Each process must be an object.',
            'processIndex' => $index,
        ], 422);
    }

    $processId = trim((string)($process['processId'] ?? ''));
    $rawBurstTime = $process['burstTime'] ?? null;

    if ($processId === '' || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,11}$/', $processId)) {
        respond([
            'message' => 'Each process ID must start with a letter and contain up to 12 letters, numbers, underscores, or hyphens.',
            'processIndex' => $index,
        ], 422);
    }

    $normalizedId = strtoupper($processId);

    if (isset($seenIds[$normalizedId])) {
        respond([
            'message' => 'Process IDs must be unique.',
            'processId' => $processId,
        ], 422);
    }

    if (!is_numeric($rawBurstTime)) {
        respond([
            'message' => 'Burst time must be a valid number.',
            'processId' => $processId,
        ], 422);
    }

    $burstTime = (float)$rawBurstTime;

    if (!is_finite($burstTime) || $burstTime <= 0) {
        respond([
            'message' => 'Burst time must be greater than zero.',
            'processId' => $processId,
        ], 422);
    }

    $seenIds[$normalizedId] = true;
    $normalizedProcesses[] = [
        'processId' => $processId,
        'burstTime' => $burstTime,
    ];
}

/*
 * First-Come, First-Served scheduling.
 * This simulator assumes every process has arrival time 0
 * and uses the input order as the FCFS queue order.
 */
$currentTime = 0.0;
$totalWaitingTime = 0.0;
$totalTurnaroundTime = 0.0;
$results = [];

foreach ($normalizedProcesses as $process) {
    $startTime = $currentTime;
    $waitingTime = $startTime;
    $completionTime = $startTime + $process['burstTime'];
    $turnaroundTime = $completionTime;

    $results[] = [
        'processId' => $process['processId'],
        'burstTime' => round($process['burstTime'], 4),
        'startTime' => round($startTime, 4),
        'completionTime' => round($completionTime, 4),
        'waitingTime' => round($waitingTime, 4),
        'turnaroundTime' => round($turnaroundTime, 4),
    ];

    $totalWaitingTime += $waitingTime;
    $totalTurnaroundTime += $turnaroundTime;
    $currentTime = $completionTime;
}

$processCount = count($normalizedProcesses);

respond([
    'results' => $results,
    'averageWaitingTime' => round($totalWaitingTime / $processCount, 4),
    'averageTurnaroundTime' => round($totalTurnaroundTime / $processCount, 4),
    'totalExecutionTime' => round($currentTime, 4),
]);
