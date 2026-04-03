package dev.knalis.trajectaapi.service.intrf;

import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;

/**
 * Object storage abstraction used by task and worker flows.
 */
public interface FileService {
    /** Returns configured storage bucket name. */
    String getBucket();

    /** Uploads a binary source file to a specific object key. */
    void uploadToKey(String objectKey, MultipartFile file);

    /** Uploads trajectory JSON payload to a specific object key. */
    void uploadJson(String objectKey, String jsonPayload);

    /** Replaces an existing binary object and returns the same object key. */
    String updateFile(String objectKey, MultipartFile file);

    /** Opens object stream for download. */
    InputStream getObjectStream(String objectKey);

    /** Deletes object by key. */
    void delete(String objectKey);
}


