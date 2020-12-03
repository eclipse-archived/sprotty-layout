def kubernetes_config = """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node
    image: node:8.12
    tty: true
"""

pipeline {
    agent {
        kubernetes {
            label 'sprotty-layout-agent-pod'
            yaml kubernetes_config
        }
    }
    options {
        buildDiscarder logRotator(numToKeepStr: '15')
    }
    
    stages {
        stage('Build sprotty-elk') {
            environment {
                SPAWN_WRAP_SHIM_ROOT = "${env.WORKSPACE}"
                YARN_ARGS = "--cache-folder ${env.WORKSPACE}/yarn-cache --global-folder ${env.WORKSPACE}/yarn-global"
            }
            steps {
                container('node') {
                    dir('sprotty-elk') {
                        sh "yarn ${env.YARN_ARGS} install"
                        sh "yarn ${env.YARN_ARGS} test || true" // Ignore test failures
                    }
                }
            }
        }
        
      stage('Deploy (master only)') {
            when { branch 'master'}
            steps {
                build job: 'deploy-sprotty-layout', wait: false
            }
        }
    }

    post {
        success {
            junit 'sprotty-elk/artifacts/test/xunit.xml'
            archiveArtifacts 'sprotty-elk/artifacts/coverage/**'
        }
    }
}
