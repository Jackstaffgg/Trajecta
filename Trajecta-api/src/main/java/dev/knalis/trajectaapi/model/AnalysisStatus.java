package dev.knalis.trajectaapi.model;

public enum AnalysisStatus {
    COMPLETED,
    FAILED;
    
    public boolean isSuccess() {
        return this == COMPLETED;
    }
}


