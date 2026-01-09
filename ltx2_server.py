#!/usr/bin/env python3
"""
LTX-2 Video Generation REST API
Exposes text-to-video and image-to-video generation via Tailscale.
Runs on port 8001, served via Tailscale at https://gamma.tail5f2bae.ts.net:8001
"""

import os
import uuid
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Configuration
MODEL_ROOT = Path(os.getenv("LTX2_MODEL_ROOT", "/home/arthurdell/models/ltx2"))
GEMMA_ROOT = Path(os.getenv("LTX2_GEMMA_ROOT", "/home/arthurdell/models/ltx2"))
OUTPUT_DIR = Path("/home/arthurdell/ltx2_outputs")
HOST = "0.0.0.0"
PORT = 8001

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global pipeline (initialized on startup)
pipeline = None
jobs = {}
executor = ThreadPoolExecutor(max_workers=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize LTX-2 pipeline on startup."""
    global pipeline
    logger.info(f"Loading LTX-2 pipeline from {MODEL_ROOT}")

    from ltx_pipelines.ti2vid_two_stages import TI2VidTwoStagesPipeline
    from ltx_core.loader import LTXV_LORA_COMFY_RENAMING_MAP, LoraPathStrengthAndSDOps

    distilled_lora = [
        LoraPathStrengthAndSDOps(
            str(MODEL_ROOT / "ltx-2-19b-distilled-lora-384.safetensors"),
            0.6,
            LTXV_LORA_COMFY_RENAMING_MAP
        ),
    ]

    pipeline = TI2VidTwoStagesPipeline(
        checkpoint_path=str(MODEL_ROOT / "ltx-2-19b-dev-fp8.safetensors"),
        distilled_lora=distilled_lora,
        spatial_upsampler_path=str(MODEL_ROOT / "ltx-2-spatial-upscaler-x2-1.0.safetensors"),
        gemma_root=str(GEMMA_ROOT),
        loras=[]
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"LTX-2 pipeline ready. Output directory: {OUTPUT_DIR}")
    yield
    logger.info("Shutting down LTX-2 server")
    executor.shutdown(wait=False)


app = FastAPI(
    title="LTX-2 Video Generation API",
    description="REST API for AI video generation using LTX-2 on GAMMA",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---

class TextToVideoRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    seed: Optional[int] = 42
    height: int = 512
    width: int = 768
    num_frames: int = 121
    frame_rate: float = 25.0
    num_inference_steps: int = 40
    cfg_guidance_scale: float = 3.0


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: Optional[float] = None
    output_url: Optional[str] = None
    error: Optional[str] = None


# --- Endpoints ---

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    import torch
    return {
        "status": "healthy",
        "model": "ltx-2-19b-dev-fp8",
        "pipeline_loaded": pipeline is not None,
        "cuda_available": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "active_jobs": len([j for j in jobs.values() if j["status"] == "processing"]),
        "total_jobs": len(jobs)
    }


@app.get("/models")
async def list_models():
    """List available model configurations."""
    return {
        "active_model": "ltx-2-19b-dev-fp8",
        "capabilities": ["text-to-video", "image-to-video"],
        "max_frames": 241,
        "max_resolution": "768x512",
        "default_fps": 25,
        "quantization": "FP8"
    }


@app.post("/api/v1/text-to-video", response_model=JobStatus)
async def text_to_video(request: TextToVideoRequest, background_tasks: BackgroundTasks):
    """Generate video from text prompt."""
    from ltx_pipelines.utils.media_io import encode_video
    from ltx_pipelines.utils.constants import AUDIO_SAMPLE_RATE
    from ltx_core.model.video_vae import TilingConfig, get_video_chunks_number

    job_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f"{job_id}.mp4"

    jobs[job_id] = {
        "status": "pending",
        "output_path": str(output_path),
        "request": request.model_dump()
    }

    def generate():
        import torch
        try:
            logger.info(f"[{job_id}] Starting generation: {request.prompt[:50]}...")
            jobs[job_id]["status"] = "processing"

            tiling_config = TilingConfig.default()
            video_chunks_number = get_video_chunks_number(request.num_frames, tiling_config)

            video, audio = pipeline(
                prompt=request.prompt,
                negative_prompt=request.negative_prompt,
                seed=request.seed,
                height=request.height,
                width=request.width,
                num_frames=request.num_frames,
                frame_rate=request.frame_rate,
                num_inference_steps=request.num_inference_steps,
                cfg_guidance_scale=request.cfg_guidance_scale,
                images=[],
                tiling_config=tiling_config,
            )

            # Wrap encoding in no_grad to avoid inference_mode conflict with VAE decoder
            with torch.no_grad():
                encode_video(
                    video=video,
                    fps=request.frame_rate,
                    audio=audio,
                    audio_sample_rate=AUDIO_SAMPLE_RATE,
                    output_path=str(output_path),
                    video_chunks_number=video_chunks_number,
                )

            jobs[job_id]["status"] = "completed"
            logger.info(f"[{job_id}] Generation completed: {output_path}")
        except Exception as e:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)
            logger.error(f"[{job_id}] Generation failed: {e}", exc_info=True)

    background_tasks.add_task(lambda: executor.submit(generate).result())
    return JobStatus(job_id=job_id, status="pending")


@app.post("/api/v1/image-to-video", response_model=JobStatus)
async def image_to_video(
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    num_frames: int = Form(121),
    seed: int = Form(42),
    image: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """Generate video from image + text prompt."""
    from ltx_pipelines.utils.media_io import encode_video
    from ltx_pipelines.utils.constants import AUDIO_SAMPLE_RATE
    from ltx_core.model.video_vae import TilingConfig, get_video_chunks_number

    job_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f"{job_id}.mp4"
    image_path = OUTPUT_DIR / f"{job_id}_input.jpg"

    contents = await image.read()
    with open(image_path, "wb") as f:
        f.write(contents)

    jobs[job_id] = {
        "status": "pending",
        "output_path": str(output_path),
        "input_image": str(image_path)
    }

    def generate():
        import torch
        try:
            logger.info(f"[{job_id}] Starting I2V generation: {prompt[:50]}...")
            jobs[job_id]["status"] = "processing"

            tiling_config = TilingConfig.default()
            video_chunks_number = get_video_chunks_number(num_frames, tiling_config)

            video, audio = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                height=512,
                width=768,
                num_frames=num_frames,
                frame_rate=25.0,
                num_inference_steps=40,
                cfg_guidance_scale=3.0,
                images=[(str(image_path), 0, 1.0)],
                tiling_config=tiling_config,
            )

            # Wrap encoding in no_grad to avoid inference_mode conflict with VAE decoder
            with torch.no_grad():
                encode_video(
                    video=video,
                    fps=25.0,
                    audio=audio,
                    audio_sample_rate=AUDIO_SAMPLE_RATE,
                    output_path=str(output_path),
                    video_chunks_number=video_chunks_number,
                )

            jobs[job_id]["status"] = "completed"
            logger.info(f"[{job_id}] I2V generation completed: {output_path}")
        except Exception as e:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)
            logger.error(f"[{job_id}] I2V generation failed: {e}", exc_info=True)

    background_tasks.add_task(lambda: executor.submit(generate).result())
    return JobStatus(job_id=job_id, status="pending")


@app.get("/api/v1/status/{job_id}", response_model=JobStatus)
async def get_status(job_id: str):
    """Check generation job status."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    output_url = None
    if job["status"] == "completed":
        output_url = f"/api/v1/download/{job_id}"

    return JobStatus(
        job_id=job_id,
        status=job["status"],
        output_url=output_url,
        error=job.get("error")
    )


@app.get("/api/v1/download/{job_id}")
async def download_video(job_id: str):
    """Download generated video."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job status: {job['status']}")

    output_path = job["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"ltx2_{job_id}.mp4"
    )


@app.get("/api/v1/jobs")
async def list_jobs(limit: int = 20):
    """List recent jobs."""
    recent = list(jobs.items())[-limit:]
    return {
        "count": len(recent),
        "jobs": [
            {"job_id": jid, "status": j["status"], "error": j.get("error")}
            for jid, j in recent
        ]
    }


@app.delete("/api/v1/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its output files."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    if "output_path" in job and os.path.exists(job["output_path"]):
        os.remove(job["output_path"])
    if "input_image" in job and os.path.exists(job["input_image"]):
        os.remove(job["input_image"])

    del jobs[job_id]
    return {"status": "deleted", "job_id": job_id}


if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting LTX-2 server on {HOST}:{PORT}")
    logger.info(f"Tailscale URL: https://gamma.tail5f2bae.ts.net:8001")
    uvicorn.run(app, host=HOST, port=PORT)
