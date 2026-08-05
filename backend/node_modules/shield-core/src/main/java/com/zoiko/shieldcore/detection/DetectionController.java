package com.zoiko.shieldcore.detection;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/detection")
public class DetectionController {

    @GetMapping
    public String getStatus() {
        return "detection API is running";
    }
}
