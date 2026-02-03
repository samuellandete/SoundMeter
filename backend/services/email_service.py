import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def format_subject(alert_type, current_db, average_db, time_slot_id):
    """
    Format email subject based on alert type

    Args:
        alert_type: 'instant' or 'average'
        current_db: Current decibel reading
        average_db: Average decibel reading (for average alerts)
        time_slot_id: Time slot ID (1-4)

    Returns:
        Formatted subject string
    """
    slot_names = {1: 'Period 1', 2: 'Period 2', 3: 'Period 3', 4: 'Period 4'}
    slot_name = slot_names.get(time_slot_id, f'Period {time_slot_id}')

    if alert_type == 'instant':
        return f"🚨 Sound Alert: Instant Threshold Exceeded ({current_db} dB) - {slot_name}"
    else:
        return f"⚠️ Sound Alert: Average Threshold Exceeded ({average_db} dB avg) - {slot_name}"


def render_text_email(alert_data, statistics):
    """
    Render plain text email content

    Args:
        alert_data: Dictionary with alert information
        statistics: Dictionary with period statistics

    Returns:
        Plain text email body
    """
    timestamp_str = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S')

    text = f"""Sound Level Alert

Alert Type: {alert_data['alert_type'].capitalize()}
Time: {timestamp_str}
Time Slot: {alert_data['slot_name']}

Current Reading: {alert_data['current_db']:.1f} dB
Instant Threshold: {alert_data['instant_threshold']:.1f} dB
Average Threshold: {alert_data['average_threshold']:.1f} dB
"""

    if alert_data['alert_type'] == 'average':
        text += f"Average over {alert_data['average_window']} minutes: {alert_data['average_db']:.1f} dB\n"

    text += f"""
Period Statistics ({alert_data['slot_name']}):
Peak: {statistics['peak_db']:.1f} dB at {statistics['peak_timestamp']}
Average: {statistics['average_db']:.1f} dB
Green: {statistics['green_percent']:.1f}%
Yellow: {statistics['yellow_percent']:.1f}%
Red: {statistics['red_percent']:.1f}%

Recent Readings:
"""

    for reading in statistics['recent_readings']:
        text += f"  {reading['timestamp']} - {reading['db']:.1f} dB ({reading['zone']})\n"

    text += "\n--\nAutomatic alert from Sound Meter System"

    return text


def render_html_email(alert_data, statistics):
    """
    Render HTML email content

    Args:
        alert_data: Dictionary with alert information
        statistics: Dictionary with period statistics

    Returns:
        HTML email body
    """
    timestamp_str = alert_data['timestamp'].strftime('%Y-%m-%d %H:%M:%S')

    # Determine alert color and icon based on type
    if alert_data['alert_type'] == 'instant':
        alert_color = '#dc2626'  # red
        alert_icon = '🚨'
        alert_title = 'Instant Threshold Exceeded'
    else:
        alert_color = '#ea580c'  # orange
        alert_icon = '⚠️'
        alert_title = 'Average Threshold Exceeded'

    html = f"""<!DOCTYPE html>
<html>
<head>
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background-color: {alert_color};
            color: white;
            padding: 20px;
            border-radius: 5px 5px 0 0;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            background-color: #f9fafb;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-top: none;
        }}
        .metric {{
            background-color: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
            border-left: 4px solid {alert_color};
        }}
        .metric-label {{
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 5px;
        }}
        .metric-value {{
            font-size: 24px;
            font-weight: bold;
            color: {alert_color};
        }}
        .stats {{
            margin-top: 20px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }}
        .stat-box {{
            background-color: white;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #e5e7eb;
        }}
        .readings {{
            margin-top: 20px;
            background-color: white;
            padding: 15px;
            border-radius: 5px;
        }}
        .reading-row {{
            display: flex;
            justify-content: space-between;
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
        }}
        .reading-row:last-child {{
            border-bottom: none;
        }}
        .zone-green {{ color: #10b981; }}
        .zone-yellow {{ color: #f59e0b; }}
        .zone-red {{ color: #dc2626; }}
        .footer {{
            text-align: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{alert_icon} {alert_title}</h1>
    </div>

    <div class="content">
        <p><strong>Time:</strong> {timestamp_str}</p>
        <p><strong>Time Slot:</strong> {alert_data['slot_name']}</p>

        <div class="metric">
            <div class="metric-label">Current Sound Level</div>
            <div class="metric-value">{alert_data['current_db']:.1f} dB</div>
        </div>
"""

    if alert_data['alert_type'] == 'average':
        html += f"""
        <div class="metric">
            <div class="metric-label">Average over {alert_data['average_window']} minutes</div>
            <div class="metric-value">{alert_data['average_db']:.1f} dB</div>
        </div>
"""

    html += f"""
        <div class="metric">
            <div class="metric-label">Configured Thresholds</div>
            <div style="margin-top: 10px;">
                <div>Instant: {alert_data['instant_threshold']:.1f} dB</div>
                <div>Average: {alert_data['average_threshold']:.1f} dB</div>
            </div>
        </div>

        <div class="stats">
            <h3>Period Statistics ({alert_data['slot_name']})</h3>
            <div class="stats-grid">
                <div class="stat-box">
                    <strong>Peak:</strong> {statistics['peak_db']:.1f} dB<br>
                    <small>{statistics['peak_timestamp']}</small>
                </div>
                <div class="stat-box">
                    <strong>Average:</strong> {statistics['average_db']:.1f} dB
                </div>
                <div class="stat-box">
                    <span class="zone-green">Green:</span> {statistics['green_percent']:.1f}%
                </div>
                <div class="stat-box">
                    <span class="zone-yellow">Yellow:</span> {statistics['yellow_percent']:.1f}%
                </div>
                <div class="stat-box">
                    <span class="zone-red">Red:</span> {statistics['red_percent']:.1f}%
                </div>
            </div>
        </div>

        <div class="readings">
            <h3>Recent Readings</h3>
"""

    for reading in statistics['recent_readings']:
        zone_class = f"zone-{reading['zone']}"
        html += f"""
            <div class="reading-row">
                <span>{reading['timestamp']}</span>
                <span class="{zone_class}">{reading['db']:.1f} dB</span>
            </div>
"""

    html += """
        </div>
    </div>

    <div class="footer">
        Automatic alert from Sound Meter System
    </div>
</body>
</html>
"""

    return html


def send_alert_email(recipient, smtp_host, smtp_port, alert_data, statistics):
    """
    Send alert email via SMTP

    Args:
        recipient: Email recipient address
        smtp_host: SMTP server hostname
        smtp_port: SMTP server port
        alert_data: Dictionary with alert information
        statistics: Dictionary with period statistics

    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = format_subject(
            alert_data['alert_type'],
            alert_data['current_db'],
            alert_data.get('average_db'),
            alert_data['time_slot_id']
        )
        msg['From'] = 'soundmeter@asvalencia.org'
        msg['To'] = recipient

        # Add plain text and HTML versions
        text_part = MIMEText(render_text_email(alert_data, statistics), 'plain', 'utf-8')
        html_part = MIMEText(render_html_email(alert_data, statistics), 'html', 'utf-8')

        msg.attach(text_part)
        msg.attach(html_part)

        # Send email
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.send_message(msg)

        return True, "Email sent successfully"

    except smtplib.SMTPException as e:
        return False, f"SMTP error: {str(e)}"
    except Exception as e:
        return False, f"Error sending email: {str(e)}"
