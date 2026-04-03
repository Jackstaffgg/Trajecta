@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%"
set "API_DIR=%ROOT_DIR%\Trajecta-api"
set "WORKER_DIR=%ROOT_DIR%\Trajecta-worker"

set "GRADLEW=%API_DIR%\gradlew.bat"
set "API_COMPOSE_FILE=%API_DIR%\compose.yaml"
set "WORKER_COMPOSE_FILE=%WORKER_DIR%\docker-compose.yml"

if not exist "%GRADLEW%" (
  echo [ERROR] Gradle wrapper not found: "%GRADLEW%"
  exit /b 1
)

if not exist "%API_COMPOSE_FILE%" (
  echo [ERROR] API compose file not found: "%API_COMPOSE_FILE%"
  exit /b 1
)

if not exist "%WORKER_COMPOSE_FILE%" (
  echo [ERROR] Worker compose file not found: "%WORKER_COMPOSE_FILE%"
  exit /b 1
)

pushd "%API_DIR%"
if errorlevel 1 (
  echo [ERROR] Unable to switch to API project directory: "%API_DIR%"
  exit /b 1
)

set "RUN_BUILD=1"
set "RUN_TESTS=1"
set "RUN_COMPOSE=1"
set "RUN_LOGS=0"

:parse_args
if "%~1"=="" goto run

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

if /I "%~1"=="logs" (
  set "RUN_LOGS=1"
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
if "%RUN_BUILD%"=="1" (
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
  echo Running: docker compose -f "%API_COMPOSE_FILE%" up --build --force-recreate --remove-orphans -d
  docker compose -f "%API_COMPOSE_FILE%" up --build --force-recreate --remove-orphans -d
  if errorlevel 1 (
    echo [ERROR] API Docker Compose failed.
    popd
    exit /b 1
  )

  echo Running: docker compose -f "%WORKER_COMPOSE_FILE%" up --build --force-recreate --remove-orphans -d
  docker compose -f "%WORKER_COMPOSE_FILE%" up --build --force-recreate --remove-orphans -d
  if errorlevel 1 (
    echo [ERROR] Worker Docker Compose failed.
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
)

echo Done.
popd
exit /b 0

:usage
echo Usage:
echo   start-all-stacks.bat [skiptests] [skipbuild] [skipcompose] [autologs]
echo.
echo Examples:
echo   start-all-stacks.bat
echo   start-all-stacks.bat skiptests
echo   start-all-stacks.bat skipcompose
echo   start-all-stacks.bat autologs
echo   start-all-stacks.bat skiptests autologs
popd
exit /b 0


