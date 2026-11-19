// SafeInbox CI/CD pipeline
//   Checkout -> backend tests -> frontend lint & build -> build images -> deploy (docker compose) -> smoke test
//
// Requirements (see README "CI/CD with Jenkins"):
//   * a Linux Jenkins agent with the Docker CLI + compose plugin and access to a Docker engine
//     (ci/jenkins/ runs exactly that on your machine and configures everything below automatically)
//   * a "Secret text" credential with ID `safeinbox-google-client-id` holding the Google OAuth client ID
//   * optional environment variable SAFEINBOX_ADMIN_EMAILS on the agent: accounts that get the admin role
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 45, unit: 'MINUTES')
    }

    triggers {
        // Check GitHub for new commits every ~5 minutes (use a GitHub webhook instead if Jenkins is public).
        pollSCM('H/5 * * * *')
    }

    parameters {
        booleanParam(name: 'DEPLOY', defaultValue: true, description: 'Deploy with docker compose after a successful build')
    }

    environment {
        COMPOSE_PROJECT_NAME = 'safeinbox'
        GOOGLE_CLIENT_ID     = credentials('safeinbox-google-client-id')
        ADMIN_EMAILS         = "${env.SAFEINBOX_ADMIN_EMAILS ?: ''}"
        BACKEND_TEST_IMAGE   = "safeinbox-backend:test-${env.BUILD_NUMBER}"
        FRONTEND_CHECK_IMAGE = "safeinbox-frontend:check-${env.BUILD_NUMBER}"
        DOCKER_BUILDKIT      = '1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --oneline'
            }
        }

        stage('Tools') {
            steps {
                sh 'docker version --format "Docker engine {{.Server.Version}}" && docker compose version'
            }
        }

        stage('Backend: tests') {
            steps {
                // The Dockerfile's "test" stage installs pytest and runs the whole test suite.
                sh 'docker build --target test -t "$BACKEND_TEST_IMAGE" safeinbox-backend'
            }
        }

        stage('Frontend: lint & build') {
            steps {
                sh 'docker build --target build -t "$FRONTEND_CHECK_IMAGE" frontend'
            }
        }

        stage('Build images') {
            steps {
                sh 'docker compose build'
            }
        }

        stage('Deploy') {
            when { expression { params.DEPLOY } }
            steps {
                sh 'docker compose up -d --remove-orphans'
            }
        }

        stage('Smoke test') {
            when { expression { params.DEPLOY } }
            steps {
                // Calls the API through nginx, so it checks frontend -> backend -> MongoDB together.
                sh '''
                    for attempt in $(seq 1 36); do
                        if docker compose exec -T frontend wget -qO- http://127.0.0.1/api/health; then
                            echo
                            echo "SafeInbox is up: http://localhost:3000"
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "SafeInbox did not become healthy in time"
                    exit 1
                '''
            }
        }

        stage('Deploy to cloud') {
            // Optional: only runs when deploy-hook credentials exist. Use it if you turned off auto-deploy
            // in Render/Vercel so the public site is only updated after these tests pass.
            when { expression { params.DEPLOY } }
            steps {
                script {
                    def hooks = [
                        [id: 'safeinbox-render-deploy-hook', name: 'Render (backend)'],
                        [id: 'safeinbox-vercel-deploy-hook', name: 'Vercel (frontend)'],
                    ]
                    for (hook in hooks) {
                        try {
                            withCredentials([string(credentialsId: hook.id, variable: 'DEPLOY_HOOK_URL')]) {
                                sh 'curl -fsS -X POST "$DEPLOY_HOOK_URL" > /dev/null'
                            }
                            echo "Triggered ${hook.name} deployment"
                        } catch (org.jenkinsci.plugins.credentialsbinding.impl.CredentialNotFoundException ignored) {
                            echo "No '${hook.id}' credential - ${hook.name} deploys on its own from GitHub"
                        }
                    }
                }
            }
        }
    }

    post {
        failure {
            sh 'docker compose ps || true'
            sh 'docker compose logs --tail=150 || true'
        }
        always {
            sh 'docker image rm -f "$BACKEND_TEST_IMAGE" "$FRONTEND_CHECK_IMAGE" >/dev/null 2>&1 || true'
            sh 'docker image prune -f >/dev/null 2>&1 || true'
        }
    }
}
