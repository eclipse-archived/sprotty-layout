def kubernetes_config = """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: node
    image: node:12.18.3
    tty: true
    resources:
      limits:
        memory: "2Gi"
        cpu: "1"
      requests:
        memory: "2Gi"
        cpu: "1"
    volumeMounts:
    - mountPath: "/.yarn"
      name: "yarn-global"
      readonly: false
  volumes:
  - name: "yarn-global"
    emptyDir: {}
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
                YARN_CACHE_FOLDER = "${env.WORKSPACE}/yarn-cache"
                SPAWN_WRAP_SHIM_ROOT = "${env.WORKSPACE}"
            }
            steps {
                container('node') {
                    dir('sprotty-elk') {
                        sh "yarn install"
                        sh "yarn test || true" // Ignore test failures
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
