@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR:~0,-1%"
set "API_DIR=%ROOT_DIR%\Trajecta-api"
set "WORKER_DIR=%ROOT_DIR%\Trajecta-worker"
set "FRONTEND_DIR=%ROOT_DIR%\Trajecta-frontend"

set "GRADLEW=%API_DIR%\gradlew.bat"
set "API_COMPOSE_FILE=%API_DIR%\compose.yaml"
set "WORKER_COMPOSE_FILE=%WORKER_DIR%\docker-compose.yml"
set "FRONTEND_COMPOSE_FILE=%FRONTEND_DIR%\docker-compose.yml"
set "WORKER_REPLICAS=%WORKER_REPLICAS%"
if "%WORKER_REPLICAS%"=="" set "WORKER_REPLICAS=2"

pushd "%API_DIR%"
if errorlevel 1 (
  echo [ERROR] Unable to switch to API project directory: "%API_DIR%"
  exit /b 1
)

set "ACTION=up"
set "RUN_BUILD=0"
set "RUN_TESTS=0"
set "RUN_COMPOSE=1"
set "RUN_LOGS=0"

:parse_args
if "%~1"=="" goto run

if /I "%~1"=="up" (
  set "ACTION=up"
  shift
  goto parse_args
)

if /I "%~1"=="restart" (
  set "ACTION=restart"
  shift
  goto parse_args
)

if /I "%~1"=="down" (
  set "ACTION=down"
  shift
  goto parse_args
)

if /I "%~1"=="status" (
  set "ACTION=status"
  shift
  goto parse_args
)

if /I "%~1"=="logs" (
  set "ACTION=logs"
  set "RUN_LOGS=1"
  shift
  goto parse_args
)

if /I "%~1"=="validate" (
  set "ACTION=validate"
  shift
  goto parse_args
)

if /I "%~1"=="build" (
  set "RUN_BUILD=1"
  shift
  goto parse_args
)

if /I "%~1"=="tests" (
  set "RUN_BUILD=1"
  set "RUN_TESTS=1"
  shift
  goto parse_args
)

if /I "%~1"=="skiptests" (
  set "RUN_TESTS=0"
  shift
  goto parse_args
)

if /I "%~1"=="skipbuild" (
  set "RUN_BUILD=0"
  shift
  goto parse_args
)

if /I "%~1"=="skipcompose" (
  set "RUN_COMPOSE=0"
  shift
  goto parse_args
)

if /I "%~1"=="autologs" (
  set "RUN_LOGS=1"
  shift
  goto parse_args
)

if /I "%~1"=="workers" (
  if "%~2"=="" (
    echo [ERROR] Missing value after workers. Example: workers 2
    popd
    exit /b 1
  )
  set "WORKER_REPLICAS=%~2"
  shift
  shift
  goto parse_args
)

if /I "%~1"=="help" goto usage
if /I "%~1"=="/h" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--help" goto usage

echo [WARN] Unknown argument: %~1
shift
goto parse_args

:run
where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker CLI was not found in PATH.
  popd
  exit /b 1
)

if not exist "%API_COMPOSE_FILE%" (
  echo [ERROR] API compose file not found: "%API_COMPOSE_FILE%"
  popd
  exit /b 1
)

if not exist "%WORKER_COMPOSE_FILE%" (
  echo [ERROR] Worker compose file not found: "%WORKER_COMPOSE_FILE%"
  popd
  exit /b 1
)

if not exist "%FRONTEND_COMPOSE_FILE%" (
  echo [ERROR] Frontend compose file not found: "%FRONTEND_COMPOSE_FILE%"
  popd
  exit /b 1
)

if /I "%ACTION%"=="status" goto action_status
if /I "%ACTION%"=="logs" goto action_logs
if /I "%ACTION%"=="down" goto action_down
if /I "%ACTION%"=="validate" goto action_validate

if /I "%ACTION%"=="restart" (
  set "RUN_BUILD=0"
  set "RUN_TESTS=0"
  set "RUN_COMPOSE=1"
)

if "%RUN_BUILD%"=="1" (
  if not exist "%GRADLEW%" (
    echo [ERROR] Gradle wrapper not found: "%GRADLEW%"
    popd
    exit /b 1
  )

  if "%RUN_TESTS%"=="1" (
    echo Running: "%GRADLEW%" clean build
    call "%GRADLEW%" clean build
  ) else (
    echo Running: "%GRADLEW%" clean build -x test
    call "%GRADLEW%" clean build -x test
  )
  if errorlevel 1 (
    echo [ERROR] Gradle build failed.
    popd
    exit /b 1
  )
) else (
  echo Build step skipped.
)

if "%RUN_COMPOSE%"=="1" (
  echo Running: docker compose -f "%API_COMPOSE_FILE%" up --build -d backend
  docker compose -f "%API_COMPOSE_FILE%" up --build -d backend
  if errorlevel 1 (
    echo [ERROR] API Docker Compose failed.
    popd
    exit /b 1
  )

  echo Running: docker compose -f "%WORKER_COMPOSE_FILE%" up --build -d --scale worker=%WORKER_REPLICAS% worker
  docker compose -f "%WORKER_COMPOSE_FILE%" up --build -d --scale worker=%WORKER_REPLICAS% worker
  if errorlevel 1 (
    echo [ERROR] Worker Docker Compose failed.
    popd
    exit /b 1
  )

  echo Running: docker compose -f "%FRONTEND_COMPOSE_FILE%" up --build -d frontend
  docker compose -f "%FRONTEND_COMPOSE_FILE%" up --build -d frontend
  if errorlevel 1 (
    echo [ERROR] Frontend Docker Compose failed.
    popd
    exit /b 1
  )
) else (
  echo Compose step skipped.
)

if "%RUN_LOGS%"=="1" (
  if "%RUN_COMPOSE%"=="0" (
    echo [WARN] Auto logs requested, but compose step was skipped. Showing logs for current stacks.
  )

  echo Opening API logs in a new terminal window...
  start "Trajecta API Logs" cmd /k docker compose -f "%API_COMPOSE_FILE%" logs -f --tail=200

  echo Opening worker logs in a new terminal window...
  start "Trajecta Worker Logs" cmd /k docker compose -f "%WORKER_COMPOSE_FILE%" logs -f --tail=200

  echo Opening frontend logs in a new terminal window...
  start "Trajecta Frontend Logs" cmd /k docker compose -f "%FRONTEND_COMPOSE_FILE%" logs -f --tail=200
)

echo Done.
popd
exit /b 0

:action_status
echo Running: docker compose -f "%API_COMPOSE_FILE%" ps
docker compose -f "%API_COMPOSE_FILE%" ps
if errorlevel 1 (
  echo [ERROR] API Docker Compose status failed.
  popd
  exit /b 1
)

echo Running: docker compose -f "%WORKER_COMPOSE_FILE%" ps
docker compose -f "%WORKER_COMPOSE_FILE%" ps
if errorlevel 1 (
  echo [ERROR] Worker Docker Compose status failed.
  popd
  exit /b 1
)

echo Running: docker compose -f "%FRONTEND_COMPOSE_FILE%" ps
docker compose -f "%FRONTEND_COMPOSE_FILE%" ps
if errorlevel 1 (
  echo [ERROR] Frontend Docker Compose status failed.
  popd
  exit /b 1
)

echo Done.
popd
exit /b 0

:action_logs
set "RUN_LOGS=1"

echo Opening API logs in a new terminal window...
start "Trajecta API Logs" cmd /k docker compose -f "%API_COMPOSE_FILE%" logs -f --tail=200

echo Opening worker logs in a new terminal window...
start "Trajecta Worker Logs" cmd /k docker compose -f "%WORKER_COMPOSE_FILE%" logs -f --tail=200

echo Opening frontend logs in a new terminal window...
start "Trajecta Frontend Logs" cmd /k docker compose -f "%FRONTEND_COMPOSE_FILE%" logs -f --tail=200

echo Done.
popd
exit /b 0

:action_down
echo Running: docker compose -f "%FRONTEND_COMPOSE_FILE%" down --remove-orphans
docker compose -f "%FRONTEND_COMPOSE_FILE%" down --remove-orphans
if errorlevel 1 (
  echo [ERROR] Frontend Docker Compose down failed.
  popd
  exit /b 1
)

echo Running: docker compose -f "%WORKER_COMPOSE_FILE%" down --remove-orphans
docker compose -f "%WORKER_COMPOSE_FILE%" down --remove-orphans
if errorlevel 1 (
  echo [ERROR] Worker Docker Compose down failed.
  popd
  exit /b 1
)

echo Running: docker compose -f "%API_COMPOSE_FILE%" down --remove-orphans
docker compose -f "%API_COMPOSE_FILE%" down --remove-orphans
if errorlevel 1 (
  echo [ERROR] API Docker Compose down failed.
  popd
  exit /b 1
)

echo Done.
popd
exit /b 0

:action_validate
echo Running: docker compose -f "%API_COMPOSE_FILE%" config
docker compose -f "%API_COMPOSE_FILE%" config >nul
if errorlevel 1 (
  echo [ERROR] API Docker Compose config is invalid.
  popd
  exit /b 1
)

echo Running: docker compose -f "%WORKER_COMPOSE_FILE%" config
docker compose -f "%WORKER_COMPOSE_FILE%" config >nul
if errorlevel 1 (
  echo [ERROR] Worker Docker Compose config is invalid.
  popd
  exit /b 1
)

echo Running: docker compose -f "%FRONTEND_COMPOSE_FILE%" config
docker compose -f "%FRONTEND_COMPOSE_FILE%" config >nul
if errorlevel 1 (
  echo [ERROR] Frontend Docker Compose config is invalid.
  popd
  exit /b 1
)

echo [OK] All compose files are valid.
popd
exit /b 0

:usage
echo Usage:
echo   start-all-stacks.bat [up^|restart^|down^|status^|logs^|validate] [build] [tests] [skipcompose] [autologs] [workers N]
echo.
echo Default behavior:
echo   start-all-stacks.bat
echo   ^- starts API + worker + frontend locally with Docker Compose (no Gradle build)
echo.
echo Examples:
echo   start-all-stacks.bat
echo   start-all-stacks.bat up
echo   start-all-stacks.bat up build
echo   start-all-stacks.bat up tests
echo   start-all-stacks.bat restart
echo   start-all-stacks.bat down
echo   start-all-stacks.bat status
echo   start-all-stacks.bat logs
echo   start-all-stacks.bat validate
echo   start-all-stacks.bat skipcompose
echo   start-all-stacks.bat autologs
echo   start-all-stacks.bat up build autologs
echo   start-all-stacks.bat up workers 2
echo.
echo Worker scaling:
echo   - default WORKER_REPLICAS=%WORKER_REPLICAS%
echo   - override via argument: workers N
echo   - or environment variable before run: set WORKER_REPLICAS=2
popd
exit /b 0


